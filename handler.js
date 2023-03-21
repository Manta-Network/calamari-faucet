'use strict';

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';

import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.db_readwrite);

const calamariSocketUrl = 'wss://ws.calamari.systems';

// see: https://www.binance.com/en/blog/all/get-started-on-bnb-smart-chain-in-60-seconds-421499824684901055
const binanceRpcEndpoint = 'https://bsc-dataseed.binance.org';

// thanks megan!
const babtSmartContract = '0x2b09d47d550061f995a3b5c6f0fd58005215d7c8';

// first 4 bytes of keccak-256 hash of `balanceOf(address)`
// computed with https://emn178.github.io/online-tools/keccak_256.html
const methodSignature = '0x70a08231';

const isValidSubstrateAddress = (address) => {
  try {
    encodeAddress(
      isHex(address)
        ? hexToU8a(address)
        : decodeAddress(address)
    );
    return true;
  } catch (error) {
    return false;
  }
};

const hasBalance = async (babtAddress) => {
  /*
  see:
  - https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract
  - https://docs.soliditylang.org/en/latest/abi-spec.html
  */
  const response = await fetch(
    binanceRpcEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: babtSmartContract,
            data: `${methodSignature}000000000000000000000000${babtAddress}`
          },
          'latest'
        ]
      },
    }
  );
  const json = await response.json();
  return !!json.result;
};

const getPriorDrips = async (babtAddress) => {
  return await client.db('calamari-faucet').collection('babt-drip').findOne({ babtAddress });
};

const recordDrip = async (babtAddress, kmaAddress, identity) => {
  const update = await client.db('calamari-faucet').collection('babt-drip').updateOne(
    {
      babtAddress,
    },
    {
      $push: {
        drip: {
          time: new Date(),
          amount: process.env.babt_kma_drip_amount,
          beneficiary: kmaAddress,
          identity,
        },
      },
    },
    {
      upsert: true,
    }
  );
  return (update.acknowledged && !!update.upsertedCount);
};

const dripNow = async (babtAddress, kmaAddress, identity) => {
  const provider = new WsProvider(calamariSocketUrl);
  const api = await ApiPromise.create({ provider });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);
  const faucet = new Keyring({ type: 'sr25519' }).addFromMnemonic(process.env.calamari_faucet_mnemonic);
  try {
    const unsub = await api.tx.balances
      .transfer(kmaAddress, BigInt(process.env.babt_kma_drip_amount))
      .signAndSend(faucet, async ({ events = [], status, txHash, dispatchError }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { docs, name, section } = decoded;
            console.log(`babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, dispatch error: ${section}.${name} - ${docs.join(' ')}`);
          } else {
            console.log(`babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, dispatch error: ${dispatchError.toString()}`);
          }
        }
        if (status.isFinalized) {
          console.log(`babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, block hash: ${status.asFinalized}, transaction: ${txHash.toHex()}`);
          await recordDrip(babtAddress, kmaAddress, identity);
          unsub();
        }
      });
  } catch (exception) {
    console.error(`babt: ${babtAddress}, kma: ${kmaAddress}, exception:`, exception);
  }
  //return true;
};

export const drip = async (event) => {
  const babtAddress = event.pathParameters.babtAddress.slice(-40);
  const kmaAddress = event.pathParameters.kmaAddress;

  // https://stackoverflow.com/a/46021715/68115
  const identity = (!!event.requestContext)
    ? event.requestContext.identity
    : undefined;

  const isValidBabtAddress = !!/^(0x)?[0-9a-f]{40}$/i.test(babtAddress);
  const isValidKmaAddress = isValidSubstrateAddress(kmaAddress);

  const prior = (isValidBabtAddress && isValidKmaAddress)
    ? (await getPriorDrips(babtAddress))
    : false;
  const hasBabtBalance = (isValidBabtAddress && isValidKmaAddress)
    ? (await hasBalance(babtAddress))
    : false;

  return {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
      'Content-Type': 'application/json',
    },
    statusCode: 200,
    body: JSON.stringify(
      {
        status: (!isValidBabtAddress)
          ? 'invalid-babt-address'
          : (!isValidKmaAddress)
            ? 'invalid-kma-address'
            : (!!prior && !!prior.drip && !!prior.drip.length)
              ? 'prior-drip-observed'
              : !hasBabtBalance
                ? 'zero-balance-observed'
                : (await dripNow(babtAddress, kmaAddress, identity))
                  ? 'drip-success'
                  : 'drip-fail',
      },
      null,
      2
    ),
  };
};
