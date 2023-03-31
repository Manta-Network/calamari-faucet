'use strict';

import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import utils from 'web3-utils';

import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.db_readwrite);

const calamariSocketUrl = 'wss://ws.calamari.systems';

// see: https://www.binance.com/en/blog/all/get-started-on-bnb-smart-chain-in-60-seconds-421499824684901055
const binanceRpcEndpoint = 'https://bsc-dataseed.binance.org';

// thanks megan!
const babtSmartContract = '0x2b09d47d550061f995a3b5c6f0fd58005215d7c8';

// first 4 bytes of keccak-256 hash
// see: https://emn178.github.io/online-tools/keccak_256.html
// balanceOf(address): 70a08231
// ownerOf(uint256): 6352211e
// totalSupply(): 18160ddd
const methodSignature = (methodSignatureAsString) => utils.keccak256(methodSignatureAsString).slice(0, 10);

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

/*
see:
- https://docs.soliditylang.org/en/latest/abi-spec.html
- https://www.quicknode.com/docs/ethereum/eth_call
*/
const ethCall = async (endpoint, contract, method, parameters = [], tag = 'latest') => {
  const params = [
    {
      to: contract,
      data: `${methodSignature(method)}${parameters.map((p) => utils.padLeft(p, 64).slice(2)).join('')}`
    },
    tag
  ];
  //console.log({ endpoint, contract, method, parameters, tag, params });
  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params
      }),
    }
  );
  return await response.json();
};

const hasBalance = async (babtAddress) => (
  !!(await balanceOf(babtAddress)).result
);

/*
see:
- https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract#F3
*/
const balanceOf = async (babtAddress) => (
  await ethCall(binanceRpcEndpoint, babtSmartContract, 'balanceOf(address)', [babtAddress])
);

const getAccount = async (id) => {
  const { error, result } = await ownerOf(id);
  return {
    id,
    ...(!!result && (result.length === 66)) && {
      address: `0x${result.slice(-40)}`,
    },
    ...(!!error && !!error.code) && { status: error.code },
  };
};

/*
see:
- https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract#F9
*/
const ownerOf = async (tokenId) => (
  await ethCall(binanceRpcEndpoint, babtSmartContract, 'ownerOf(uint256)', [tokenId])
);

const hasPriorDrips = async (babtAddress, kmaAddress) => {
  const drips = (await Promise.all([
    client.db('calamari-faucet').collection('babt-drip').findOne({ babtAddress }),
    client.db('calamari-faucet').collection('babt-drip').findOne({ drip: { $elemMatch: { beneficiary: kmaAddress } } })
  ])).filter((x) => (!!x));
  return (drips.length > 0);
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
  let finalized = false;
  const provider = new WsProvider(calamariSocketUrl);
  const api = await ApiPromise.create({ provider });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);
  const faucet = new Keyring({ type: 'sr25519' }).addFromMnemonic(process.env.calamari_faucet_mnemonic);
  let { data: { free: previousFree }, nonce: previousNonce } = await api.query.system.account(kmaAddress);
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
          await recordDrip(babtAddress, kmaAddress, { ip: identity.sourceIp, agent: identity.userAgent });
          finalized = true;
          unsub();
        }
      });
  } catch (exception) {
    console.error(`babt: ${babtAddress}, kma: ${kmaAddress}, exception:`, exception);
  }
  api.query.system.account(kmaAddress, async ({ data: { free: currentFree }, nonce: currentNonce }) => {
    const delta = currentFree.sub(previousFree);
    if (!delta.isZero() && (BigInt(process.env.babt_kma_drip_amount) === BigInt(delta))) {
      if ((BigInt(process.env.babt_kma_drip_amount) === BigInt(delta))) {
        await recordDrip(babtAddress, kmaAddress, { ip: identity.sourceIp, agent: identity.userAgent });
        finalized = true;
      }
      console.log(`babt: ${babtAddress}, kma: ${kmaAddress}, delta: ${delta}`);
      previousFree = currentFree;
      previousNonce = currentNonce;
    }
  });
  while (!finalized) {
    await new Promise(r => setTimeout(r, 1000));
  }
  return finalized;
};

const range = (start, end) => (
  (end > start)
    ? [...Array((end - start + 1)).keys()].map((k) => (k + start))
    : [...Array((start - end + 1)).keys()].map((k) => (k + end)).reverse()
);

const recordAccount = async (account) => (
  await client.db('babt').collection('account').updateOne(
    {
      id: account.id,
    },
    {
      $set: account,
    },
    {
      upsert: true,
    }
  )
);

const discover = async(ids) => {
  const accounts = await Promise.all(ids.map(getAccount));
  const updates = await Promise.all(accounts.map(recordAccount))
  console.log(`${ids[0]} to ${ids.slice(-1)} - discovered: ${accounts.filter((a) => !!a.address).length}, recorded: ${updates.filter((u) => !!u.upsertedCount).length}`);
}

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
    ? (await hasPriorDrips(babtAddress, kmaAddress))
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

export const babtAccountDiscovery = async() => {
  const chunk = {
    size: 100,
    start: (await client.db('babt').collection('account').find({ address: { $exists: true } }).sort({id: -1}).limit(1).toArray())[0].id + 1
  };
  await discover(range(chunk.start, (chunk.start + chunk.size - 1)));
  /*
  todo:
  - look for missing records in the db and fetch from chain
  - iterate the whole collection continuously in order to discover invalidations
  - set chunk size based on the last run duration
  */
};
