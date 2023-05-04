import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex, stringToU8a, u8aToHex } from '@polkadot/util';
import { MongoClient } from 'mongodb';
import * as config from './config.js';

const client = new MongoClient(process.env.db_readwrite);

export const hasPriorDrips = async (mintType, babtAddress, kmaAddress) => {
  const substrateAddress = encodeAddress(isHex(kmaAddress) ? hexToU8a(kmaAddress) : decodeAddress(kmaAddress));
  const drips = (await Promise.all([
    client.db('calamari-faucet').collection(config.get_drip_collection()).findOne({ babtAddress, mintType }),
    client.db('calamari-faucet').collection(config.get_drip_collection()).findOne({ drip: { $elemMatch: { beneficiary: substrateAddress } } })
  ])).filter((x) => (!!x));
  //console.log(drips);
  return (drips.length > 0);
};

export const hasPriorAllowlist = async (mintType, babtAddress) => {
  const allowlist = (await Promise.all([
    client.db('calamari-faucet').collection(config.get_allowlist_collection()).findOne({ babtAddress, mintType }),
  ])).filter((x) => (!!x));
  // console.log("hasPriorAllowlist:" + JSON.stringify(allowlist));
  return (allowlist.length > 0);
};

export const recordDrip = async (mintType, babtAddress, kmaAddress, identity) => {
  const substrateAddress = encodeAddress(isHex(kmaAddress) ? hexToU8a(kmaAddress) : decodeAddress(kmaAddress));
  const update = await client.db('calamari-faucet').collection(config.get_drip_collection()).updateOne(
    {
      babtAddress,
      mintType
    },
    {
      $push: {
        drip: {
          time: new Date(),
          amount: process.env.babt_kma_drip_amount,
          beneficiary: substrateAddress,
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

export const recordAllowlist = async (mintType, babtAddress, token_id, identity) => {
  const update = await client.db('calamari-faucet').collection(config.get_allowlist_collection()).updateOne(
    {
      babtAddress,
      mintType
    },
    {
      $push: {
        allowlist: {
          token_id,
          time: new Date(),
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

export const recordMintMetadata = async (token_type, mint_id, is_contract, is_whitelist, is_customize, metadata) => {
  const update = await client.db('calamari-faucet').collection(config.get_mintmeta_collection()).updateOne(
    {
      token_type
    },
    { 
      $set: {
        mint_id,
        is_contract,
        is_whitelist,
        is_customize,
        metadata,
        time: new Date()
      }
    },
    {
      upsert: true,
    }
  );
  return (update.acknowledged && !!update.upsertedCount);
};

export const getMintMetadata = async (token_type) => {
  const metadata = (await Promise.all([
    client.db('calamari-faucet').collection(config.get_mintmeta_collection()).findOne({ token_type }),
  ])).filter((x) => (!!x));
  if(metadata.length == 0) {
    return null;
  }
  return metadata[0];
};

export const getMintExtraMetadata = async (token_type) => {
  const metadata = (await Promise.all([
    client.db('calamari-faucet').collection(config.get_mintmeta_collection()).findOne({ token_type }),
  ])).filter((x) => (!!x));
  if(metadata.length == 0) {
    return null;
  }
  const extra_meta = metadata[0].metadata;
  return extra_meta;
};

export const recordAccount = async (account) => (
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