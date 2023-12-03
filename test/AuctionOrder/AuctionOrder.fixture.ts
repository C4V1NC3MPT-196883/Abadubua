import { expect } from "chai";
import { log } from "console";
import { BigNumberish, BytesLike, ContractMethodArgs, Typed, getBytes } from "ethers";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import { Address } from "hardhat-deploy/types";

import type { OrderMarket } from "../../types";
import { TypedContractMethod } from "../../types/common";
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
    const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
        method: TypedContractMethod<A>,
        ...params: A
    ) => {
        //const gasLimit = await method.estimateGas(...params);
        const updatedParams: ContractMethodArgs<A> = [...params, { gasLimit: 100000000 }];
        return method(...updatedParams);
    };
    const signers = await getSigners(ethers);

    const contractFactory = await ethers.getContractFactory("OrderMarket");
    const contractauctioncall = await contractFactory.connect(signers.alice).deploy(4);
    await contractauctioncall.waitForDeployment();
    const addressauctioncall = await contractauctioncall.getAddress();
    const auctioncallinstances = await createInstances(addressauctioncall, ethers, signers);

    // const contractFactory2 = await ethers.getContractFactory("AuctionOrder");
    // let from = addressauctioncall;
    // let salt: BytesLike = ethers.encodeBytes32String(ethers.toBeHex(1728));
    // let initCode = contractFactory2.bytecode;
    // let initCodeHash = ethers.keccak256(initCode);
    // const address1 = ethers.getCreate2Address(from, salt, initCodeHash);

    const publickeyforbob_uint8array = auctioncallinstances.bob.getTokenSignature(addressauctioncall)!.publicKey;
    const addressbob = await signers.bob.getAddress();
    const pk_bob = uint8ArrayToBytes32(publickeyforbob_uint8array);

    const auctioninfos: any[] = [pk_bob, "jinitaimei", "trashcoal", 10, 100, 20, 240];
    const tx_bob = await createTransaction(
        contractauctioncall.connect(signers.bob).createNewOrder,
        auctioninfos[0],
        auctioninfos[1],
        auctioninfos[2],
        auctioninfos[3],
        auctioninfos[4],
        auctioninfos[5],
        auctioninfos[6],
    );
    console.log(
        "The test starts with the auction info: ",
        "\ncreator/seller:",
        auctioninfos[0],
        ",",
        "\nauction name: ",
        auctioninfos[1],
        ",",
        "\ncoal type: ",
        auctioninfos[2],
        ",",
        "\nreserve price: ",
        auctioninfos[3],
        ",",
        "\nquantity: ",
        auctioninfos[4],
        ",",
        "\nminimal split: ",
        auctioninfos[5],
        ",",
        "\n duration: ",
        auctioninfos[6],
    );
    const deploylogs_launcherbob = await tx_bob.wait();
    console.log("gas: ", deploylogs_launcherbob?.gasUsed, "status: ", deploylogs_launcherbob?.status);
    const addressauctioninstance = await deploylogs_launcherbob.logs[0].args[1];
    return [addressauctioninstance, addressauctioncall, addressbob];
}
