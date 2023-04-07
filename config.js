// thanks megan!
export const babtSmartContract = '0x2b09d47d550061f995a3b5c6f0fd58005215d7c8';

export const endpoint = {
    calamari: 'wss://ws.calamari.systems',
    // binance: 'https://bsc-dataseed.binance.org',
    binance: 'https://bsc-dataseed1.ninicoin.io',
    zqhxuyuan: 'wss://zenlink.zqhxuyuan.cloud:444',
    staging: 'wss://ws.calamari.seabird.systems',
};
// CHANGE TO calamari on production
export const current_endpoint = endpoint.zqhxuyuan;

// CHANGE THE NAME
export const drip_collection = "test-babt-drip-1";
export const allowlist_collection = "test-babt-allowlist-1";

// NOTE, change to 1 in production
export const dripMultiply = 100;

// CHANGE SIGNER ACCOUNT
export const signer = {
    dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf: process.env.shortlist_signer,
};

export const signer_address = "dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf";
