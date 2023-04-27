import * as config from "./config.js";
import {ApiPromise, WsProvider, Keyring} from "@polkadot/api";
import {cryptoWaitReady} from "@polkadot/util-crypto";
import * as db from "./db.js";
import * as util from "./util.js";
import * as action from "./action.js";

export const ops = async (event) => {
    const payload = JSON.parse(event.body);
    // const key = payload.key.toLowerCase(); 
    const identity = (!!event.requestContext) ? event.requestContext.identity : undefined;

    const mintType = "BABWhitelist"

    const endpoint = config.get_endpoint();
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider, noInitWarn: true });
    await Promise.all([ api.isReady, cryptoWaitReady() ]);
    const shortlistSigner = new Keyring({ type: 'sr25519' }).addFromMnemonic(config.signer[config.signer_address]);

    // 2023-04-26 18:41:15        RPC-CORE: submitExtrinsic(extrinsic: Extrinsic): Hash:: 1014: Priority is too low: (1409 vs 1409): The transaction has too low priority to replace another transaction already in the pool.
    // await Promise.all(payload.shortlist.map(async (address) => {
    //     console.log("processing address:" + address);
    //     return await api.tx.mantaSbt.allowlistEvmAccount({ bab: address }).signAndSend(shortlistSigner, { nonce: -1 });
    // }));

    // RpcError: 1014: Priority is too low: (1409 vs 1409): The transaction has too low priority to replace another transaction already in the pool.
    // const addresses = payload.shortlist.map((address) => address);
    // addresses.forEach(async address => {
    //     console.log("process:" + address);
    //     await api.tx.mantaSbt.allowlistEvmAccount({ bab: address }).signAndSend(shortlistSigner, { nonce: -1 });
    // })

    // OK, each block has only one transaction if is localdev mode
    const addresses = payload.shortlist.map((address) => address);
    for(var index in addresses) {
        const address = addresses[index].toLowerCase();
        const hasExist = await db.hasPriorAllowlist(mintType, address);
        if(hasExist) {
            console.log(`addresss: ${address} already recorded.`);
            continue;
        }

        await api.tx.mantaSbt.allowlistEvmAccount({ bab: address }).signAndSend(
            shortlistSigner, { nonce: -1 }, 
            async ({ events = [], status, txHash, dispatchError }) => {
                if (status.isInBlock) {
                    await db.recordAllowlist(mintType, address, 0, { ip: identity.sourceIp, agent: identity.userAgent });
                    console.log(`addresss: ${address}, transaction: ${txHash.toHex()}`);
                }
        });
    }

    // Batch Ok.
    // const batchesTx = payload.shortlist.map((address) => {
    //     return api.tx.mantaSbt.allowlistEvmAccount({ bab: address });
    // });
    // await api.tx.utility.batchAll(batchesTx).signAndSend(shortlistSigner, { nonce: -1 }, async ({ events = [], status, txHash, dispatchError }) => {
    //     if (status.isInBlock) {
    //         console.log(`transaction: ${txHash.toHex()}`);
    //     }
    // });
    
    console.log("done");
};