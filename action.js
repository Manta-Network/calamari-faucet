
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady, signatureVerify } from '@polkadot/util-crypto';
import * as util from './util.js';
import * as config from './config.js';
import * as db from './db.js';
//import fetch from 'node-fetch';

export const dripNow = async (mintType, babtAddress, kmaAddress, identity) => {
  let finalized = false;
  const provider = new WsProvider(config.get_endpoint());
  // console.log("endpoint:" + config.get_endpoint());
  const api = await ApiPromise.create({ provider });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);
  const faucet = new Keyring({ type: 'sr25519' }).addFromMnemonic(process.env.calamari_faucet_mnemonic);
  // console.log("faucet address:" + faucet.address);
  let { data: { free: previousFree }, nonce: previousNonce } = await api.query.system.account(kmaAddress);
  const dripAmount = BigInt(process.env.babt_kma_drip_amount) * BigInt(config.dripMultiply);
  try {
    const unsub = await api.tx.balances
      .transfer(kmaAddress, dripAmount)
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
        // TODO: current manta endpoint has finalized issue, need to change to isFinalized
        if (status.isInBlock) {
          // console.log(`babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, block hash: ${status.asFinalized}, transaction: ${txHash.toHex()}`);
          await db.recordDrip(mintType, babtAddress, kmaAddress, { ip: identity.sourceIp, agent: identity.userAgent });
          finalized = true;
          unsub();
        }
      });
  } catch (exception) {
    console.error(`babt: ${babtAddress}, kma: ${kmaAddress}, exception:`, exception);
  }
  api.query.system.account(kmaAddress, async ({ data: { free: currentFree }, nonce: currentNonce }) => {
    const delta = currentFree.sub(previousFree);
    if (!delta.isZero() && (dripAmount === BigInt(delta))) {
      if ((dripAmount === BigInt(delta))) {
        await db.recordDrip(mintType, babtAddress, kmaAddress, { ip: identity.sourceIp, agent: identity.userAgent });
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

export const allowlistNow = async (mintType, babtAddress, identity) => {
    let finalized = false;
    const address = {
      bab: babtAddress
    };
  
    if(!util.hasToken(babtAddress)) {
      return false;
    }
  
    await cryptoWaitReady();
    const provider = new WsProvider(config.get_endpoint());
    const api = await ApiPromise.create({ provider });
    await api.isReady;
  
    // TODO: Use fixed account signer for now.
    const shortlistSigner = new Keyring({ type: 'sr25519' }).addFromMnemonic(config.signer[config.signer_address]);
    
    const unsub = await api.tx.mantaSbt.allowlistEvmAccount(address)
    .signAndSend(shortlistSigner, async ({ events = [], status, txHash, dispatchError }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          const { docs, name, section } = decoded;
          console.log(`babt: ${babtAddress}, status: ${status.type}, dispatch error: ${section}.${name} - ${docs.join(' ')}`);
        } else {
          console.log(`babt: ${babtAddress}, status: ${status.type}, dispatch error: ${dispatchError.toString()}`);
        }
      }
      // TODO: current manta endpoint has finalized issue, need to change to isFinalized
      if (status.isInBlock) { 
        // console.log(`babt: ${babtAddress}, status: ${status.type}, block hash: ${status.asFinalized}, transaction: ${txHash.toHex()}`);
        await db.recordAllowlist(mintType, babtAddress, { ip: identity.sourceIp, agent: identity.userAgent });
        finalized = true;
        unsub();
      }
    });
    while (!finalized) {
      await new Promise(r => setTimeout(r, 1000));
    }
    const allowInfo = await api.query.mantaSbt.evmAddressAllowlist(address);
    console.log(address + "allow info:" + JSON.stringify(allowInfo));
    return finalized;
  }
  