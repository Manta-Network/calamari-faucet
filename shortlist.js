import * as config from "./config.js";
import {ApiPromise, WsProvider} from "@polkadot/api";
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as action from "./action.js";
import axios from 'axios';

var api;

export const shortlist = async (event) => {
    const payload = JSON.parse(event.body);
    const ethAddress = payload.shortlist.toLowerCase(); // only one address
    const token_type = payload.token_type == undefined ? "BAB": payload.token_type;
    const mintType = token_type === "zkBAB" || token_type === "BAB" ? "BAB" : token_type.toLowerCase();

    const mintMetadata = await db.getMintMetadata(mintType);
    if(mintMetadata == null) {
        console.log(`mintType: ${mintType} haven't metadata set, plz contact admin`);
        return util.response_data({
            status: 'allow-fail',
            msg: `Mint ${mintType} is not allowed.`
        });
    }
    // console.log(`mint metadata of:${mintType}: ${JSON.stringify(mintMetadata)}`);
    const is_contract = mintMetadata.is_contract;
    const is_whitelist = mintMetadata.is_whitelist;
    const is_customize = mintMetadata.is_customize;
    const mint_id = mintMetadata.mint_id;
    const metadata_tokenType = mintMetadata.token_type;
    const extra_meta = mintMetadata.metadata;

    if(metadata_tokenType != mintType) {
        return util.response_data({
            status: 'allow-fail',
            msg: `Mint ${mintType} is not matched.`
        });
    }

    let status = "";
    let token = "0x00";
    let addressHasBalance = false;

    const isValidEthAddress = !!util.isValidEthAddress(ethAddress);
    if (!isValidEthAddress) {
        if (mintType === "BAB") {
            status = 'invalid-babt-address';
        } else {
            status = 'invalid-eth-address';
        }
        return util.response_data({status,token});
    }

    const getDbPrior = await db.getOnePriorAllowlist(mintType, ethAddress);
    const hasDbPrior = isValidEthAddress ? (getDbPrior.length > 0) : false;
    console.log(`[shortlist] ${mintType}: ${ethAddress}, query prior:${hasDbPrior}, isContract:${is_contract}, isWhitelist:${is_whitelist}, isCustomize:${is_customize}, mintId:${mint_id}`);

    if(hasDbPrior) {
        // The whitelist process is first insert user's address into database
        // but not insert into on-chain storage. so in this case, only user request
        // this api, then the address will be insert into on-chain storage.
        if (is_whitelist || mintType == "zktaskon" || mintType == "zkfrontier") {
            // whitelist, token default is "0x00"
            await onchainAction(event, mintType, mint_id, ethAddress, token);
        } else if(getDbPrior.length > 0) {
            // none-whitelist case normally has this `allowlist` array, because it's insert after onchain action.
            const tokenId = getDbPrior[0]["allowlist"][0]["token_id"];
            if(tokenId != undefined) {
                token = tokenId;
            }
            if(tokenId == 0) {
                token = "0x00";
            }
        }
        status = 'prior-allow-observed';
        return util.response_data({status,token});
    }

    // Not in db if is whitelist case, then user don't allow to mint.
    if (is_whitelist) {
        status = 'zero-balance-observed';
        return util.response_data({status,token});
    } 

    // Not in db cases...
    if(is_contract) {
        const endpoint = extra_meta.chain_scan_endpoint;
        const contract = extra_meta.contract_address;
        const balanceCallName = extra_meta.balance_call_name;    
        const call_result = await util.ethCall(endpoint, contract, balanceCallName, [ethAddress]);
        const balance = call_result.result;
        if (balance != null && balance !== config.contract_zero_balance) {
            addressHasBalance = true;
        }
    }
    if(is_customize) {
        if(mintType == "zkreadon") {
            const response = await util.customizeCall(extra_meta, mintType, ethAddress);
            if(response != null) {
                const balance = response.data?.has_sbt;
                if(balance != undefined && balance == 1) {
                    addressHasBalance = true;
                }
                const token_id = response.data?.token_id;
                if(token_id != undefined) {
                    token = token_id;
                }
            }
        } else if(mintType == "zkcyberconnect") {
            const response = await util.cyberConnectGraphqlQueryProfile(extra_meta, ethAddress);
            let edges = response.data?.address?.wallet?.profiles?.edges;
            if(edges != undefined && edges.length > 0) {
                // Get first profile id as final token name passing to frontend.
                const profileId = response.data.address.wallet.profiles.edges[0]?.node?.profileID;
                const eligible = await util.cyberConnectGraphqlQueryEssences(extra_meta, ethAddress);
                console.log(`${token_type} request:${ethAddress}. profileId:${profileId},eligible:${eligible}`);
                if(eligible) {
                    addressHasBalance = true;
                    token = profileId.toString();
                }
                // const edges2 = response2.data?.address?.wallet?.collectedEssences?.edges;
                // We have condition that only 10+ W3STs name must be qualified.
                // console.log(`${token_type} request:${ethAddress}. profileId:${profileId},total:${edges2?.length}`);
                // if(edges2 != undefined && edges2.length >= 10) {
                //     const W3STs = edges2.filter(edge => edge.node?.essence?.name === "Web3 Status Token")
                //     console.log(`${token_type} request:${ethAddress}. profileId:${profileId},W3STs:${W3STs.length}`);
                //     if(W3STs.length >= 10) {
                //         addressHasBalance = true;
                //         token = profileId.toString();
                //     }
                // }
            }
        } else if(mintType == "zkultiverse") {
            const response = await util.customizGetCall(extra_meta, mintType, ethAddress);
            console.log(token_type + " request:" + ethAddress + ",response:" + JSON.stringify(response));
            if(response != null && (response.isMoonlightHolder || response.isMetaMergeHolder || response.isEsHolder)) {
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
                addressHasBalance = true;
                token = '0x0' + (ml + mm + es);
            }
        } else if(mintType == "zktaskon") {
            const call_result = await util.ethCall(extra_meta.chain_scan_endpoint, extra_meta.contract_address, extra_meta.balance_call_name, [ethAddress]);
            const balance = call_result.result;
            if (balance != null && balance !== config.contract_zero_balance) {
                addressHasBalance = true;
            } else {
                const call_result = await util.ethCall(extra_meta.chain_scan_endpoint2, extra_meta.contract_address2, extra_meta.balance_call_name2, [ethAddress]);
                const balance = call_result.result;
                if (balance != null && balance !== config.contract_zero_balance) {
                    addressHasBalance = true;
                }
            }
        } else if(mintType == "zkfrontier") {
            const contracts = [extra_meta.contract_address, extra_meta.contract_address1, extra_meta.contract_address2, extra_meta.contract_address3, extra_meta.contract_address4];
            for(var i=0;i<contracts.length;i++) {
                const contract = contracts[i];
                const call_result = await util.ethCall(extra_meta.chain_scan_endpoint,contract, extra_meta.balance_call_name, [ethAddress]);
                const balance = call_result.result;
                console.log(`${mintType}: ${ethAddress} call-${i}: ${balance}`);
                if (balance != null && balance !== config.contract_zero_balance && balance != config.contract_zero_balance0) {
                    addressHasBalance = true;
                    break;
                }
            }
        } else if(mintType == "zkgetaverse") {
            const contracts = [extra_meta.contract_address, extra_meta.contract_address4, extra_meta.contract_address1, extra_meta.contract_address2, extra_meta.contract_address3];
            const endpoints = [extra_meta.chain_scan_endpoint, extra_meta.chain_scan_endpoint4, extra_meta.chain_scan_endpoint1, extra_meta.chain_scan_endpoint2, extra_meta.chain_scan_endpoint3];
            for(var i=0;i<contracts.length;i++) {
                const contract = contracts[i];
                const call_result = await util.ethCall(endpoints[i], contract, extra_meta.balance_call_name, [ethAddress]);
                const balance = call_result.result;
                console.log(`${mintType}: ${ethAddress} call-${i}-${contract}: ${balance}`);
                if (balance != undefined && balance != null && balance !== config.contract_zero_balance && balance != config.contract_zero_balance0) {
                    addressHasBalance = true;
                    break;
                }
            }    
        } else if(mintType == "zkkaratdao" || mintType == "zkburgercities") {
            const contracts = extra_meta.contract_address;
            const endpoint = extra_meta.chain_scan_endpoint;
            for(var i=0;i<contracts.length;i++) {
                const contract = contracts[i];
                const call_result = await util.ethCall(endpoint, contract, extra_meta.balance_call_name, [ethAddress]);
                const balance = call_result.result;
                console.log(`${mintType}: ${ethAddress} call-${i}-${contract}: ${balance}`);
                if (balance != undefined && balance != null && balance !== config.contract_zero_balance && balance != config.contract_zero_balance0) {
                    addressHasBalance = true;
                    break;
                }
            }
        } 
        else if(mintType == "zkfuturist") {
            const data = await db.getPartnerMetadata(mintType);
            const metadata = data.metadata;
            const check_url = metadata.check_url;
            const token = data.access;
            const response = await axios.get(check_url, {
                params: {
                    address: ethAddress
                },
                headers: { 
                    Authorization: `Bearer ${token}` 
                }
            });
            // {"success":true,"result":{"is_holder":false}}
            console.log(mintType + "," + ethAddress + ",response: " + JSON.stringify(response.data));
            const resp = response.data;
            if(resp && resp.success == true) {
                const holder = resp.result?.is_holder;
                if(holder) {
                    addressHasBalance = holder;
                }
            }
        }
    }

    // validate if the address has balance
    // Not in db, not have balance, not allow to mint.
    if (!addressHasBalance) {
        status = 'zero-balance-observed';
        return util.response_data({status,token});
    }

    // Not in db, but have balance
    if(is_contract) {
        const endpoint = mintMetadata.metadata.chain_scan_endpoint;
        const contract = mintMetadata.metadata.contract_address;
        const tokenCallName = mintMetadata.metadata.token_call_name;

        const call_result2 = await util.ethCall(endpoint, contract, tokenCallName, [ethAddress]);
        token = call_result2.result;
    }

    status = await onchainAction(event, mintType, mint_id, ethAddress, token);
    console.log(`[shortlist] ${mintType}: ${ethAddress}, status:${status},token:${token}`);

    return util.response_data({status,token});
};

export const onchainAction = async(event, mintType, mintId, ethAddress, tokenId) => {
    let status = "";
    const identity = (!!event.requestContext) ? event.requestContext.identity : undefined;

    // const endpoint = config.get_endpoint();
    // const provider = new WsProvider(endpoint);
    // const api = await ApiPromise.create({ provider, noInitWarn: true });
    // await Promise.all([ api.isReady, cryptoWaitReady() ]);
    // console.log("connected api.")

    let inner_api = await global_api();
    console.log(new Date() + " connected api..");

    try {
        const tx_flag = await action.allowlistNow(inner_api, mintType, mintId, ethAddress, tokenId, identity);
        if (tx_flag === true) {
            status = 'allow-success';
        } else {
            status = 'allow-fail';
        }
    } catch(error) {
        console.log("onchain error:", error);
        inner_api = await global_api();
        const tx_flag = await action.allowlistNow(inner_api, mintType, mintId, ethAddress, tokenId, identity);
        if (tx_flag === true) {
            status = 'allow-success';
        } else {
            status = 'allow-fail';
        }
    }
    return status;
}

export const global_api = async() => {
  if(api != undefined) {
    return api;
  }
  const endpoint = config.get_endpoint();
  const provider = new WsProvider(endpoint);
  api = await ApiPromise.create({ provider, noInitWarn: true });
  await Promise.all([ api.isReady, cryptoWaitReady() ]);

  console.log(new Date() + " connected a new api." + endpoint)

  return api;
}