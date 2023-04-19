'use strict';

import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import * as util from './util.js';
import * as db from './db.js';
import * as action from './action.js';
import * as config from './config.js';
//import fetch from 'node-fetch';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

export const drip = async (event) => {
  const babtAddress = event.pathParameters.babtAddress.slice(-40);
  const kmaAddress = event.pathParameters.kmaAddress;

  // https://stackoverflow.com/a/46021715/68115
  const identity = (!!event.requestContext)
    ? event.requestContext.identity
    : undefined;

  const isValidBabtAddress = !!/^(0x)?[0-9a-f]{40}$/i.test(babtAddress);
  const isValidKmaAddress = util.isValidSubstrateAddress(kmaAddress);
  const mintType = "BAB";

  const prior = (isValidBabtAddress && isValidKmaAddress)
    ? (await db.hasPriorDrips(mintType, babtAddress, kmaAddress))
    : false;
  const hasBabtBalance = (isValidBabtAddress && isValidKmaAddress)
    ? (await util.hasBalance(babtAddress))
    : false;

  console.log(`[drip] bab:${babtAddress},kma:${kmaAddress},prior:${prior},hasBabtBalance:${hasBabtBalance}`);    
  return {
    headers,
    statusCode: 200,
    body: JSON.stringify(
      {
        status: (!isValidBabtAddress)
          ? 'invalid-babt-address'
          : (!isValidKmaAddress)
            ? 'invalid-kma-address'
            : (prior)
              ? 'prior-drip-observed'
              : !hasBabtBalance
                ? 'zero-balance-observed'
                : (await action.dripNow(mintType, babtAddress, kmaAddress, identity))
                  ? 'drip-success'
                  : 'drip-fail',
      },
      null,
      2
    ),
  };
};

export const dripped = async (event) => {
  const babtAddress = event.pathParameters.babtAddress.slice(-40);
  const kmaAddress = event.pathParameters.kmaAddress;
  const isValidBabtAddress = !!/^(0x)?[0-9a-f]{40}$/i.test(babtAddress);
  const isValidKmaAddress = util.isValidSubstrateAddress(kmaAddress);
  const mintType = "BAB";
  const prior = (isValidBabtAddress && isValidKmaAddress)
    ? (await db.hasPriorDrips(mintType, babtAddress, kmaAddress))
    : false;
  console.log(`[dripped] bab:${babtAddress},kma:${kmaAddress},prior:${prior}`);    
  return {
    headers,
    statusCode: 200,
    body: JSON.stringify(
      {
        status: (!isValidBabtAddress)
          ? 'invalid-babt-address'
          : (!isValidKmaAddress)
            ? 'invalid-kma-address'
            : (prior)
              ? 'dripped'
              : 'non-dripped',
      },
      null,
      2
    ),
  };
};

export const shortlist = async (event) => {
  const payload = JSON.parse(event.body);
  const babtAddress = payload.shortlist.toLowerCase(); // only one address

  const endpoint = config.get_endpoint();
  const provider = new WsProvider(endpoint);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);

  const mintType = "BAB";
  const isValidBabtAddress = !!/^(0x)?[0-9a-f]{40}$/i.test(babtAddress);
  const hasDbPrior = isValidBabtAddress ? (await db.hasPriorAllowlist(mintType, babtAddress)) : false;
  const hasBabtBalance = isValidBabtAddress ? (await util.hasBalance(babtAddress)) : false;

  const identity = (!!event.requestContext)
    ? event.requestContext.identity
    : undefined;
  console.log(`[shortlist query] bab:${babtAddress},prior:${hasDbPrior},balance:${hasBabtBalance}`);    

  const status = (!isValidBabtAddress) ? 'invalid-babt-address'
    : !hasBabtBalance ? 'zero-balance-observed'
      : (hasDbPrior) ? 'prior-allow-observed'
        // : (await action.hasOnchainPrior(api, mintType, babtAddress, identity)) ? 'prior-allow-observed'
          : (await action.allowlistNow(api, mintType, babtAddress, identity)) ? 'allow-success'
            : 'allow-fail';
  var token = 0;
  if(status === 'allow-success' || status === 'prior-allow-observed') {
    const tokenId = await util.tokenIdOf(babtAddress);
    token = tokenId.result;
    console.log(`[shortlist result] bab:${babtAddress},token:${token},status:${status}`);
  }          
  const result = {
    status,
    token
  };
  return {
    headers,
    statusCode: 200,
    body: JSON.stringify(result, null, 2),
  };
};

// export const shortlist = async (event) => {
//   const response = {
//     ...(!!event.headers.Authorization && (event.headers.Authorization.split(' ').length === 2)) && {
//       signer: event.headers.Authorization.split(' ')[0],
//       signature: event.headers.Authorization.split(' ')[1],
//       payload: JSON.parse(event.body),
//     },
//   };
//   await cryptoWaitReady();
//   if (
//     isValidSubstrateAddress(response.signer)
//     && signatureVerify(JSON.stringify(JSON.parse(event.body)), hexToU8a(response.signature), u8aToHex(decodeAddress(response.signer))).isValid
//   ) {
//     const shortlistSigner = new Keyring({ type: 'sr25519' }).addFromMnemonic(signer[encodeAddress(decodeAddress(response.signer), 78)]);
//     const provider = new WsProvider(endpoint.zqhxuyuan);
//     const api = await ApiPromise.create({ provider });
//     await api.isReady;
//     await Promise.all(response.payload.shortlist.map((address) => api.tx.mantaSbt.allowlistEvmAccount({ Bab: address }).signAndSend(shortlistSigner)));
//   }
//   return {
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Credentials': true,
//       'Content-Type': 'application/json',
//     },
//     statusCode: 200, //isValid ? 200 : 401,
//     body: JSON.stringify(response, null, 2),
//   };
// };

// const cache = {
//   chunk: {
//     size: 50,
//   },
// };

// export const babtAccountDiscovery = async() => {
//   const stopwatch = { start: performance.now() };
//   const chunk = {
//     size: cache.chunk.size,
//     start: (await client.db('babt').collection('account').find({ address: { $exists: true } }).sort({id: -1}).limit(1).toArray())[0].id + 1
//   };
//   const discovery = await discover(range(chunk.start, (chunk.start + chunk.size - 1)));
//   stopwatch.stop = performance.now();

//   // set chunk size for the next run to the number of records that can be processed
//   // in 20 seconds using the performance of the just completed run as a benchmark.
//   const elapsedSeconds = ((stopwatch.stop - stopwatch.start) / 1000);
//   const processedPerSecond = (chunk.size / elapsedSeconds);
//   const decimalFormatter = new Intl.NumberFormat('default', { maximumFractionDigits: 2 });
//   cache.chunk.size = (discovery.updates.filter((u) => !!u.upsertedCount).length < 20)
//     ? 20
//     : Math.floor(processedPerSecond * 20);
//   console.log(`processed ${chunk.size} records in ${decimalFormatter.format(elapsedSeconds)} seconds (${decimalFormatter.format(processedPerSecond)} per second). chunk size changed from ${chunk.size} to ${cache.chunk.size}.`);
//   /*
//   todo:
//   - look for missing records in the db and fetch from chain
//   - iterate the whole collection continuously in order to discover invalidations
//   */
// };
