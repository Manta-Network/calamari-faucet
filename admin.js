import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as config from "./config.js";

export const setMintMetadata = async(event) => {
    const payload = JSON.parse(event.body);
    const key = payload.key;
    const decrypt = util.hashCode(key);
    if (decrypt != config.adminKeyHash) {
        return util.response_data({msg: "key not right!"});
    }

    console.log("setMintMetadata:" + JSON.stringify(payload));
    const token_type = payload.token_type;
    const mint_id = payload.mint_id;
    const is_contract = payload.is_contract;
    const is_whitelist = payload.is_whitelist;
    const is_customize = payload.is_customize;
    const extra_metadata = payload.extra_metadata;

    // The metadata should contain information that fullfil the requirement when mint.
    // i.e. if is contract, should contain the contract address, chain, etc.
    await db.recordMintMetadata(token_type, mint_id, is_contract, is_whitelist, is_customize, extra_metadata);

    const metadata = await db.getMintMetadata(token_type);
    console.log(`metadata of ${token_type} is: ${JSON.stringify(metadata)}`);

    return util.response_data({metadata});
}

export const getMintMetadata = async(event) => {
    const payload = JSON.parse(event.body);
    const key = payload.key == undefined ? "": payload.key;
    const decrypt = util.hashCode(key);
    if (decrypt != config.adminKeyHash) {
        return util.response_data({msg: "key not right!"});
    }

    const token_type = payload.token_type;

    const metadata = await db.getMintMetadata(token_type);
    console.log(`metadata of ${token_type} is: ${JSON.stringify(metadata)}`);

    const extra_meta = await db.getMintExtraMetadata(token_type);

    return util.response_data({
        metadata,
        extra: extra_meta
    });
}

export const getTokenInfo = async(event) => {
    const payload = JSON.parse(event.body);
    const token_type = payload.token_type;
    const address = payload.address;

    const balance = await util.balanceOf(token_type, address);
    const token = await util.tokenIdOf(token_type, address);

    return util.response_data({
        balance,
        token
    });
}

export const shortlistChain = async (event) => {
    const payload = JSON.parse(event.body);
    const addresses = payload.shortlist.map((address) => address);

    const endpoint = config.get_endpoint();
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider, noInitWarn: true });
    await Promise.all([ api.isReady, cryptoWaitReady() ]);
    const shortlistSigner = new Keyring({ type: 'sr25519' }).addFromMnemonic(config.signer[config.signer_address]);
    console.log(`[shortlist] from signer: ${shortlistSigner.address}`);

    for(var index in addresses) {
        const address = addresses[index].toLowerCase();

        await api.tx.mantaSbt.allowlistEvmAccount({ galxe: address }).signAndSend(
            shortlistSigner, { nonce: -1 }, 
            async ({ events = [], status, txHash, dispatchError }) => {
                // if (status.isInBlock) {
                //     await db.recordAllowlist(mintType, address, 0, { ip: identity.sourceIp, agent: identity.userAgent });
                //     console.log(`addresss: ${address}, transaction: ${txHash.toHex()}`);
                // }
        });
    }
}

// Only allow whitelist type to add to database
export const shortlistDb = async (event) => {
    const payload = JSON.parse(event.body);
    const key = payload.key;
    const decrypt = util.hashCode(key);
    if (decrypt != config.adminKeyHash) {
        return util.response_data({msg: "key not right!"});
    }

    const mintType = payload.token_type;
    const mintMetadata = await db.getMintMetadata(mintType);
    console.log(`mint type:${mintType}: ${JSON.stringify(mintMetadata)}`)
    if(mintMetadata == null) {
        return util.response_data({msg: `Mint ${mintType} not set.`})
    }
    if (mintMetadata.metadata.is_whitelist == false) {
        return util.response_data({msg: `Mint ${mintType} is not allowed.`})
    }

    // const addresses = payload.shortlist.map((address) => address);
    var duplicateCount = 0;
    var successCount = 0;
    for(var index in payload.shortlist) {
        const address = payload.shortlist[index].toLowerCase();
        const hasExist = await db.hasPriorAllowlist(mintType, address);
        if(hasExist) {
            console.log(`address[${index}]: ${address} of ${mintType} already recorded.`);
            duplicateCount++;
            continue;
        }

        // Note: in whitelist case, the address don't have token id
        await db.recordAllowlist(mintType, address, 0);
        console.log(`record address: ${address} of ${mintType} .`);
        successCount++;
    }
    return util.response_data({
        token_type: mintType,
        duplicate: duplicateCount,
        success: successCount
    })

};
