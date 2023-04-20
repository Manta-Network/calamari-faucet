export const endpoint = {
    calamari: 'wss://i.calamari.systems',
    // binance: 'https://bsc-dataseed.binance.org',
    binance: 'https://bsc-dataseed4.ninicoin.io',
    testing: 'wss://zenlink.zqhxuyuan.cloud:444',
    staging: 'wss://c1.calamari.seabird.systems',
};

export const contracts = {
    "BAB": "0x2b09d47d550061f995a3b5c6f0fd58005215d7c8",
    "GALXE": "0xE84050261CB0A35982Ea0f6F3D9DFF4b8ED3C012"
}

export const chains = {
    "BAB": "binance",
    "GALXE": "binance"
}

export const tokenCallName = {
    "BAB": "tokenIdOf(address)",
    "GALXE": "getAddressPassport(address)",
}

// NOTE, change to 1 in staging/production
export const dripMultiply = 1;

// Not used for now.
export const dripAmount = 1500000000000;

// CHANGE SIGNER ACCOUNT
export const signer = {
    dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf: process.env.shortlist_signer,
};

export const signer_address = "dmvSXhJWeJEKTZT8CCUieJDaNjNFC4ZFqfUm4Lx1z7J7oFzBf";

export const get_endpoint = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return endpoint.staging;
    } else if(env === "testing") {
        return endpoint.testing;
    } else {
        return endpoint.calamari;
    }
}

export const get_drip_collection = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return "staging-babt-drip-1";
    } else if(env === "testing") {
        return "testing-babt-drip-1";
    } else {
        return "prod-babt-drip";
    }
}

export const get_allowlist_collection = () => {
    const env = process.env.stage_env;
    if(env === "staging") {
        return "staging-babt-allowlist-1";
    } else if(env === "testing") {
        return "testing-babt-allowlist-1";
    } else {
        return "prod-babt-allowlist";
    }
}
