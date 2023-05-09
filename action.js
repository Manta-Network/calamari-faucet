
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady, signatureVerify } from '@polkadot/util-crypto';
import * as util from './util.js';
import * as config from './config.js';
import * as db from './db.js';
//import fetch from 'node-fetch';

export const dripNow = async (mintType, babtAddress, kmaAddress, identity) => {
  let finalized = false;
  const endpoint = config.get_endpoint();
  const provider = new WsProvider(endpoint);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);
  const faucet = new Keyring({ type: 'sr25519' }).addFromMnemonic(process.env.calamari_faucet_mnemonic);
  console.log(`drip endpoint:${endpoint} from faucet:${faucet.address} to ${kmaAddress} of bab:${babtAddress}`);

  let { data: { free: previousFree }, nonce: previousNonce } = await api.query.system.account(kmaAddress);
  const dripAmount = BigInt(process.env.babt_kma_drip_amount) * BigInt(config.dripMultiply);
  try {
    const unsub = await api.tx.balances
      .transfer(kmaAddress, dripAmount)
      /*
      see:
      - nonce auto handling: https://polkadot.js.org/docs/api/cookbook/tx/
      - method signature (options + callback): https://github.com/polkadot-js/api/blob/9fe2798/packages/api/src/submittable/createClass.ts#L212-L213
      */
      .signAndSend(faucet, { nonce: -1 }, async ({ events = [], status, txHash, dispatchError }) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { docs, name, section } = decoded;
            console.log(`drip babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, dispatch error: ${section}.${name} - ${docs.join(' ')}`);
          } else {
            console.log(`drip babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, dispatch error: ${dispatchError.toString()}`);
          }
        }
        // TODO: current manta endpoint has finalized issue, need to change to isFinalized
        if (status.isInBlock) {
          console.log(`drip recordDrip babt: ${babtAddress}, kma: ${kmaAddress}, status: ${status.type}, transaction: ${txHash.toHex()}`);
          await db.recordDrip(mintType, babtAddress, kmaAddress, { ip: identity.sourceIp, agent: identity.userAgent });
          finalized = true;
          unsub();
        }
      });
  } catch (exception) {
    console.error(`drip babt: ${babtAddress}, kma: ${kmaAddress}, exception:`, exception);
  }
  await api.query.system.account(kmaAddress, async ({data: {free: currentFree}, nonce: currentNonce}) => {
    const delta = currentFree.sub(previousFree);
    if (!delta.isZero() && (dripAmount === BigInt(delta))) {
      if ((dripAmount === BigInt(delta))) {
        await db.recordDrip(mintType, babtAddress, kmaAddress, {ip: identity.sourceIp, agent: identity.userAgent});
        finalized = true;
      }
      console.log(`drip babt: ${babtAddress}, kma: ${kmaAddress}, delta: ${delta}`);
      previousFree = currentFree;
      previousNonce = currentNonce;
    }
  });
  while (!finalized) {
    await new Promise(r => setTimeout(r, 1000));
  }
  return finalized;
};

export const allowlistNow = async (api, mintType, mintId, evmAddress, token_id, identity) => {
  let finalized = false;

  // Query storage, if exists, then return
  const queryAllowInfo = await api.query.mantaSbt.evmAccountAllowlist(mintId, evmAddress);
  console.log(`query onchain mintId:${mintId}, address: ${evmAddress}, token:${token_id}, result:${JSON.stringify(queryAllowInfo)}`);
  
  if(queryAllowInfo.isNone !== true) {
    const json = JSON.parse(JSON.stringify(queryAllowInfo));
    if(!(await db.hasPriorAllowlist(mintType, evmAddress))) {
      await db.recordAllowlist(mintType, evmAddress, token_id, { ip: identity.sourceIp, agent: identity.userAgent });
      console.log(`[shortlist] ${mintType}: ${evmAddress}, token:${token_id} exist onchain, but not on db, put it now.`);
    }
    if(json.available != undefined) {
      console.log(`[shortlist] ${mintType}: ${evmAddress}, available:${queryAllowInfo}`);
      return true;
    } else {
      console.log(`[shortlist] ${mintType}: ${evmAddress}, already minted on chain!`);
      return false;
    }
  }

  const shortlistSigner = new Keyring({ type: 'sr25519' }).addFromMnemonic(config.signer[config.signer_address]);
  console.log(`[shortlist] ${mintType} FROM signer: ${shortlistSigner.address} TO ${evmAddress}`);

  const unsub = await api.tx.mantaSbt.allowlistEvmAccount(mintId, evmAddress)
  .signAndSend(shortlistSigner, { nonce: -1 }, async ({ events = [], status, txHash, dispatchError }) => {
    if (dispatchError) {
      if (dispatchError.isModule) {
        const decoded = api.registry.findMetaError(dispatchError.asModule);
        const { docs, name, section } = decoded;
        console.log(`[shortlist] ${mintType}: ${evmAddress}, status: ${status.type}, dispatch error: ${section}.${name} - transaction: ${txHash.toHex()}`);
      } else {
        console.log(`[shortlist] ${mintType}: ${evmAddress}, status: ${status.type}, dispatch error: ${dispatchError.toString()} - transaction: ${txHash.toHex()}`);
      }
    }
    // TODO: current manta endpoint has finalized issue, need to change to isFinalized
    if (status.isInBlock) {
      console.log(`[shortlist] ${mintType}: ${evmAddress} recordAllowlist status: ${status.type}, transaction: ${txHash.toHex()}`);
      if(!(await db.hasPriorAllowlist(mintType, evmAddress))) {
        await db.recordAllowlist(mintType, evmAddress, token_id, { ip: identity.sourceIp, agent: identity.userAgent });
      }
      finalized = true;
      unsub();
    }
  });
  let allowInfo = await api.query.mantaSbt.evmAccountAllowlist(mintId, evmAddress);
  while(allowInfo.isNone === true) {
    await new Promise(r => setTimeout(r, 2000));
    console.log(`[shortlist] ${mintType}: ${evmAddress} allowInfo is none:${JSON.stringify(allowInfo)}`);
    allowInfo = await api.query.mantaSbt.evmAccountAllowlist(mintId, evmAddress);
    // unsub();
  }
  finalized = true;
  console.log(`[shortlist] ${mintType}: ${evmAddress} return and got allowed:${JSON.stringify(allowInfo)}`);
  return finalized;
}
