import { expect } from "chai";
import { log } from "console";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import { Address } from "hardhat-deploy/types";

import type { AuctionCall } from "../../types";
import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";

export function uint8ArrayToBytes32(uint8Array: Uint8Array): string {
    // 将 Uint8Array 转换为 ethers.js 中的 BytesLike 类型
    const bytesLikeValue = ethers.getBytes(uint8Array);

    // 将 BytesLike 转换为 bytes32
    const bytes32Value = ethers.hexlify(bytesLikeValue);

    return bytes32Value;
}

export async function getnewcontractfromdeploy(): Promise<Address[]> {
    const signers = await getSigners(ethers);

    const contractFactory = await ethers.getContractFactory("AuctionCall");
    const contractauctioncall = await contractFactory.connect(signers.alice).deploy(4);
    await contractauctioncall.waitForDeployment();
    const addressauctioncall = await contractauctioncall.getAddress();
    const auctioncallinstances = await createInstances(addressauctioncall, ethers, signers);

    const publickeyforbob_uint8array = auctioncallinstances.bob.getTokenSignature(addressauctioncall)!.publicKey;
    const addressbob = await signers.bob.getAddress();
    const pk_bob = uint8ArrayToBytes32(publickeyforbob_uint8array);

    const tx_bob = await contractauctioncall
        .connect(signers.bob)
        .CreateNewAuction(pk_bob, "jinitaimei", "trashcoal", 10, 100, 100, 10);
    console.log(pk_bob, ",", "jinitaimei", ",", "trashcoal", ",", 10, ",", 100, ",", 100, ",", 10);
    const deploylogs_launcherbob = await tx_bob.wait();
    const addressauctioninstance = await deploylogs_launcherbob.logs[0].args[1];
    return [addressauctioninstance, addressauctioncall, addressbob];
}
