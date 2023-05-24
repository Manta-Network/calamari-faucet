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
    var token_type = payload.token_type.toLowerCase();
    if(token_type === "bab") {
        token_type = "BAB";
    }
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

    const metadatas = await db.getMintMetadatas();
    return util.response_data({metadatas});
}

export const getTokenInfo = async(event) => {
    const payload = JSON.parse(event.body);
    const address = payload.address.toLowerCase();
    const key = payload.key;
    const decrypt = util.hashCode(key);
    if (decrypt != config.adminKeyHash) {
        return util.response_data({msg: "key not right!"});
    }

    let mintType = payload.token_type;
    let tokens = [];
    if(mintType) {
        tokens = [mintType];
    } else {
        tokens = ["BAB", "zkgalxe", "zkreadon", "zkarbairdrop", "zkcyberconnect"];
    }

    const results = [];
    for(var i=0;i<tokens.length;i++) {
        const token_type = tokens[i];
        const mintMetadata = await db.getMintMetadata(token_type);
        const mintId = mintMetadata.mint_id;
        const is_contract = mintMetadata.is_contract;
        const is_whitelist = mintMetadata.is_whitelist;
        const is_customize = mintMetadata.is_customize;
        const extra_metadata = mintMetadata.metadata;
        
        let hasBalance = false;
        let callToken = null;
        let callBalance = null;
        let dbToken = null;
        const hasDbToken = await db.hasPriorAllowlist(token_type, address);
        const dbRecord = await db.getOnePriorAllowlist(token_type, address);
        if(dbRecord.length > 0) {
            // in whitelist case, when use mongoimport, we don't set allowlist, so `allowlist` field is empty.
            if(dbRecord[0]["allowlist"] != undefined) {
                dbToken = dbRecord[0]["allowlist"][0]["token_id"];
            }
        }
            
        const endpoint = config.get_endpoint();
        const provider = new WsProvider(endpoint);
        const api = await ApiPromise.create({ provider, noInitWarn: true });
        await Promise.all([ api.isReady, cryptoWaitReady() ]);
        const queryAllowInfo = await api.query.mantaSbt.evmAccountAllowlist(mintId, address);

        if(is_contract) {
            const endpoint = mintMetadata.metadata.chain_scan_endpoint;
            const contract = mintMetadata.metadata.contract_address;
            const balanceCallName = mintMetadata.metadata.balance_call_name;    
            const tokenCallName = mintMetadata.metadata.token_call_name;

            const call_result = await util.ethCall(endpoint, contract, balanceCallName, [address]);
            callBalance = call_result.result;
            const call_result2 = await util.ethCall(endpoint, contract, tokenCallName, [address]);
            callToken = call_result2.result;

            if (callBalance != null && callBalance !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                hasBalance = true;
            }
        }
        if(is_customize) {
            if(token_type == "zkreadon") {
                const response = await util.customizeCall(extra_metadata, token_type, address);
                console.log(token_type + " request:" + address + ",response:" + JSON.stringify(response.data));
                if(response != null) {
                    callBalance = response["data"]["has_sbt"];
                    callToken = response["data"]["token_id"];
    
                    if(callBalance == 1) {
                        hasBalance = true;
                    }
                }
            } else if(token_type == "zkcyberconnect") {
                const response = await util.cyberConnectGraphqlQueryProfile(extra_metadata, address);
                let edges = response.data?.address?.wallet?.profiles?.edges;
                console.log(`${token_type} request:${address}. profile count:${edges.length}`);
                if(edges != undefined && edges.length > 0) {
                    // console.log(token_type + " request:" + address + ",response1:" + JSON.stringify(response.data.address.wallet.profiles));
                    const profileId = response.data.address.wallet.profiles.edges[0]?.node?.profileID?.toString();
                    const response2 = await util.cyberConnectGraphqlQueryEssences(extra_metadata, address);
                    const edges2 = response2.data?.address?.wallet?.collectedEssences?.edges;
                    console.log(`${token_type} request:${address}. profileId:${profileId},total:${edges2.length}`);
                    if(edges2 != undefined && edges2.length >= 10) {
                        const W3STs = edges2.filter(edge => edge.node?.essence?.name === "Web3 Status Token")
                        console.log(`${token_type} request:${address}. profileId:${profileId},W3STs:${W3STs.length}`);
                        if(W3STs.length >= 10) {
                            callToken = profileId;
                            callBalance = 1;
                            hasBalance = true;
                        }
                    }
                }
            } else if(token_type == "zkultiverse") {
                // ultiverse: https://assets-api.ultiverse.io/api/v1/holder/state?address=0xef1168293649dc1a31f264f5ba7f88b8c0894db4
                // {"isMoonlightHolder":false,"isMetaMergeHolder":false,"isEsHolder":true}
                const response = await util.customizGetCall(extra_metadata, token_type, address);
                console.log(token_type + " request:" + address + ",response:" + JSON.stringify(response));
                if(response != null) {
                    if(response.isMoonlightHolder || response.isMetaMergeHolder || response.isEsHolder) {
                        callBalance = 1;
                        hasBalance = true;
                    }
                    let [ml, mm, es] = [0x00, 0x00, 0x00];
                    if(response.isMoonlightHolder) {
                        ml = 0x01;
                    }
                    if(response.isMetaMergeHolder) {
                        mm = 0x02;
                    }
                    if(response.isEsHolder) {
                        es = 0x04;
                    }
                    callToken = '0x0' + (ml + mm + es);
                }
            }

        }

        results.push({
            token_type,
            mintId,
            is_contract,
            is_whitelist,
            is_customize,
            hasDbToken,
            dbToken,
            hasBalance,
            callBalance,
            callToken,
            onchain: queryAllowInfo
        });
    }

    return util.response_data(results);
}

export const shortlistChain = async (event) => {
    const payload = JSON.parse(event.body);
    const key = payload.key;
    const decrypt = util.hashCode(key);
    if (decrypt != config.adminKeyHash) {
        return util.response_data({msg: "key not right!"});
    }

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
    console.log(`mint type:${mintType}: ${JSON.stringify(mintMetadata)}`);
    if(mintMetadata == null) {
        return util.response_data({msg: `Mint ${mintType} not set.`});
    }
    if (mintMetadata.metadata.is_whitelist == false) {
        return util.response_data({msg: `Mint ${mintType} is not allowed.`});
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
