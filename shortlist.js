import * as config from "./config.js";
import {ApiPromise, WsProvider} from "@polkadot/api";
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as action from "./action.js";

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
    if(metadata_tokenType != mintType) {
        return util.response_data({
            status: 'allow-fail',
            msg: `Mint ${mintType} is not matched.`
        });
    }

    const isValidEthAddress = !!util.isValidEthAddress(ethAddress);
    const hasDbPrior = isValidEthAddress ? (await db.hasPriorAllowlist(mintType, ethAddress)) : false;
    console.log(`[shortlist] ${mintType}: ${ethAddress}, query prior:${hasDbPrior}, isContract:${is_contract}, isWhitelist:${is_whitelist}, isCustomize:${is_customize}, mintId:${mint_id}`);

    let status = "";
    if (!isValidEthAddress) {
        if (mintType === "BAB") {
            status = 'invalid-babt-address';
        } else {
            status = 'invalid-eth-address';
        }
    } else if (hasDbPrior) {
        // The whitelist process is first insert user's address into database
        // but not insert into on-chain storage. so in this case, only user request
        // this api, then the address will be insert into on-chain storage.
        if (is_whitelist) {
            await onchainAction(event, mintType, mint_id, ethAddress);
        }
        status = 'prior-allow-observed';
    } else {
        if (is_whitelist) {
            // Not in db if is whitelist case, then user don't allow to mint.
            status = "allow-fail";
        } else if(is_contract || is_customize) {
            // validate if the address has balance
            const hasBalance = await util.hasBalance(mintType, ethAddress);
            if (!hasBalance) {
                // Not in db, not have balance, not allow to mint.
                status = 'zero-balance-observed';
            } else {
                // Not in db, but have balance, allow to mint
                status = await onchainAction(event, mintType, mint_id, ethAddress);
            }
        }
    }

    let token = 0;
    if(status === 'allow-success' || status === 'prior-allow-observed') {
        const tokenId = await util.tokenIdOf(mintType, ethAddress);
        if (tokenId != null) {
            token = tokenId.result;
        }
        console.log(`[shortlist] ${mintType}: ${ethAddress}, result status:${status},token:${token}`);
    }

    return util.response_data({
        status,
        token
    });
};

export const onchainAction = async(event, mintType, mintId, ethAddress) => {
    let status = "";
    const identity = (!!event.requestContext) ? event.requestContext.identity : undefined;
    const endpoint = config.get_endpoint();
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider, noInitWarn: true });
    await Promise.all([ api.isReady, cryptoWaitReady() ]);

    const tx_flag = await action.allowlistNow(api, mintType, mintId, ethAddress, identity);
    if (tx_flag === true) {
        status = 'allow-success';
    } else {
        status = 'allow-fail';
    }
    return status;
}
