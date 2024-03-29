'use strict';

import * as util from './util.js';
import * as db from './db.js';
import * as action from './action.js';
import * as short from './shortlist.js';
import * as adminOps from './admin.js';

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
    ? (await util.hasBalance(mintType, babtAddress))
    : false;

  console.log(`[drip] bab:${babtAddress},kma:${kmaAddress},prior:${prior},hasBabtBalance:${hasBabtBalance}`);
  return {
    headers: util.headers,
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
    headers: util.headers,
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
  return await short.shortlist(event);
}

export const shortlistDb = async (event) => {
  return await adminOps.shortlistDb(event);
}

export const shortlistChain = async (event) => {
  return await adminOps.shortlistChain(event);
}

export const setMetadata = async (event) => {
  return await adminOps.setMintMetadata(event);
}

export const getMetadata = async (event) => {
  return await adminOps.getMintMetadata(event);
}

export const getTokenInfo = async (event) => {
  return await adminOps.getTokenInfo(event);
}

export const initPartnerMetadata = async (event) => {
  return await adminOps.initPartnerMetadata(event);
}

export const getPartnerMetadata = async (event) => {
  return await adminOps.getPartnerMetadata(event);
}

export const queryContract = async (event) => {
  return await adminOps.queryContract(event);
}

export const refreshQuestToken = async() => {
  const token_type = "zkfuturist";
  const parter_data = await db.getPartnerMetadata(token_type);
  // console.log(new Date() + " refreshing token..." + JSON.stringify(parter_data.metadata));
  await adminOps.freshQuestToken(token_type, parter_data.metadata);
}

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
