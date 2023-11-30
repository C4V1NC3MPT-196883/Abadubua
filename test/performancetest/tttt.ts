import { expect } from "chai";
import { log } from "console";
import { ContractMethodArgs, Typed } from "ethers";
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

describe("shit", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
    });
    beforeEach(async function () {
        const contractFactory = await ethers.getContractFactory("PerformanceTest");
        const contract = await contractFactory
            .connect(this.signers.alice)
            .deploy(15 * 2 ** 16 + 100, 17 * 2 ** 16 + 100); /**默认构造中的maxOrderCount=2  */
        await contract.waitForDeployment();
        this.contractAddress = await contract.getAddress();
        this.auction = contract;
        this.instances = await createInstances(this.contractAddress, ethers, this.signers);
    });

    // it("shitting1", async function () {
    //     this.timeout(180000);
    //     for (let i = 0; i < 10; i++) {
    //         console.log(
    //             await (await this.auction.connect(this.signers.bob).appendinglist(20 * 2 ** 16 + 80 + i)).wait(),
    //         );
    //     }
    //     const [c1, c2] = [this.instances.hausdorff.encrypt32(19), this.instances.hausdorff.encrypt32(100)];
    //     const receipt = await (await this.auction.connect(this.signers.carol).cmuxx(1, 2)).wait();
    //     console.log(receipt);
    //     // console.log(await this.auction.connect(this.signers.bob).addd(0, 1));
    //     // console.log(await this.auction.connect(this.signers.bob).whatispower(2));
    //     // console.log(await this.auction.connect(this.signers.hausdorff).pars(c1, c2));
    //     //console.log(await (await this.auction.connect(this.signers.carol).cmuxx(1, 2)).wait());
    // });

    it("shitting", async function () {
        this.timeout(600000);
        console.log(this.timeout());
        const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
            method: TypedContractMethod<A>,
            ...params: A
        ) => {
            //const gasLimit = await method.estimateGas(...params);
            const updatedParams: ContractMethodArgs<A> = [...params, { gasLimit: 9900000 }];
            return method(...updatedParams);
        };
        // const [setpriceinunitbytes_carol, setquantitybytes_carol, publickeyforcarol_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.carol.encrypt32(15)),
        //     uint8ArrayToBytes32(this.instances.carol.encrypt32(100)),
        //     uint8ArrayToBytes32(this.instances.carol.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // const [setpriceinunitbytes_dave, setquantitybytes_dave, publickeyfordave_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.dave.encrypt32(18)),
        //     uint8ArrayToBytes32(this.instances.dave.encrypt32(95)),
        //     uint8ArrayToBytes32(this.instances.dave.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // const [setpriceinunitbytes_grace, setquantitybytes_grace, publickeyforgrace_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.grace.encrypt32(25)),
        //     uint8ArrayToBytes32(this.instances.grace.encrypt32(130)),
        //     uint8ArrayToBytes32(this.instances.grace.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // const [setpriceinunitbytes_hausdorff, setquantitybytes_hausdorff, publickeyforhausdorff_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.hausdorff.encrypt32(21)),
        //     uint8ArrayToBytes32(this.instances.hausdorff.encrypt32(16)),
        //     uint8ArrayToBytes32(this.instances.hausdorff.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // await (
        //     await this.auction
        //         .connect(this.signers.carol)
        //         .apendbl(setpriceinunitbytes_carol, setquantitybytes_carol, publickeyforcarol_uint8array)
        // ).wait();
        // await (
        //     await this.auction
        //         .connect(this.signers.dave)
        //         .apendbl(setpriceinunitbytes_dave, setquantitybytes_dave, publickeyfordave_uint8array)
        // ).wait();
        // await (
        //     await this.auction
        //         .connect(this.signers.grace)
        //         .apendbl(setpriceinunitbytes_grace, setquantitybytes_grace, publickeyforgrace_uint8array)
        // ).wait();
        // await (
        //     await this.auction
        //         .connect(this.signers.hausdorff)
        //         .apendbl(setpriceinunitbytes_hausdorff, setquantitybytes_hausdorff, publickeyforhausdorff_uint8array)
        // ).wait();
        // const [setpriceinunitbytes_alice, setquantitybytes_alice, publickeyforalice_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.alice.encrypt32(21)),
        //     uint8ArrayToBytes32(this.instances.alice.encrypt32(16)),
        //     uint8ArrayToBytes32(this.instances.alice.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // await (
        //     await this.auction
        //         .connect(this.signers.alice)
        //         .apendbl(setpriceinunitbytes_alice, setquantitybytes_alice, publickeyforalice_uint8array)
        // ).wait();
        // const [setpriceinunitbytes_bob, setquantitybytes_bob, publickeyforbob_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.bob.encrypt32(21)),
        //     uint8ArrayToBytes32(this.instances.bob.encrypt32(16)),
        //     uint8ArrayToBytes32(this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // await (
        //     await this.auction
        //         .connect(this.signers.bob)
        //         .apendbl(setpriceinunitbytes_bob, setquantitybytes_bob, publickeyforbob_uint8array)
        // ).wait();
        // const [setpriceinunitbytes_israel, setquantitybytes_israel, publickeyforisrael_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.israel.encrypt32(21)),
        //     uint8ArrayToBytes32(this.instances.israel.encrypt32(16)),
        //     uint8ArrayToBytes32(this.instances.israel.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // await (
        //     await this.auction
        //         .connect(this.signers.israel)
        //         .apendbl(setpriceinunitbytes_israel, setquantitybytes_israel, publickeyforisrael_uint8array)
        // ).wait();
        // const [setpriceinunitbytes_eve, setquantitybytes_eve, publickeyforeve_uint8array] = [
        //     uint8ArrayToBytes32(this.instances.eve.encrypt32(21)),
        //     uint8ArrayToBytes32(this.instances.eve.encrypt32(16)),
        //     uint8ArrayToBytes32(this.instances.eve.getTokenSignature(this.contractAddress)!.publicKey),
        // ];
        // await (
        //     await this.auction
        //         .connect(this.signers.eve)
        //         .apendbl(setpriceinunitbytes_eve, setquantitybytes_eve, publickeyforeve_uint8array)
        // ).wait();
        // console.log(
        //     await this.auction.BiddersInfoList(0),
        //     await this.auction.BiddersInfoList(1),
        //     await this.auction.BiddersInfoList(2),
        //     await this.auction.BiddersInfoList(3),
        //     await this.auction.BiddersInfoList(4),
        //     await this.auction.BiddersInfoList(5),
        //     await this.auction.BiddersInfoList(6),
        // );

        console.log(await (await createTransaction(this.auction.connect(this.signers.eve).cmmmux)).wait());

        // const testforsorting = this.auction.connect(this.signers.eve).MakeList();
        // console.log(await (await testforsorting).wait());

        // const makemake = createTransaction(this.auction.connect(this.signers.eve).MakeList);
        // const receipt = await (await makemake).wait();
        // console.log(receipt);
        // console.log(await this.auction.BiddersNum());
        // console.log(await this.auction.cc1(), await this.auction.cc2());
        //console.log(await this.auction.CONDITION(0), await this.auction.CONDITION(1), await this.auction.CONDITION(2));
        // console.log(
        //     await this.auction.SortedParsedBiddings(0),
        //     await this.auction.SortedParsedBiddings(1),
        //     await this.auction.BiddersInfoList(2),
        // );
        //await (await this.auction.connect(this.signers.eve).MakeList()).wait();
        //console.log(await this.auction.BiddersInfoList(0), await this.auction.BiddersInfoList(1));
    });
});
// export async function getnewcontractfromdeploy(): Promise<Address[]> {
//     const signers = await getSigners(ethers);

//     const contractFactory = await ethers.getContractFactory("OrderMarket");
//     const contractauctioncall = await contractFactory.connect(signers.alice).deploy(4);
//     await contractauctioncall.waitForDeployment();
//     const addressauctioncall = await contractauctioncall.getAddress();
//     const auctioncallinstances = await createInstances(addressauctioncall, ethers, signers);

//     const publickeyforbob_uint8array = auctioncallinstances.bob.getTokenSignature(addressauctioncall)!.publicKey;
//     const addressbob = await signers.bob.getAddress();
//     const pk_bob = uint8ArrayToBytes32(publickeyforbob_uint8array);

//     const tx_bob = await contractauctioncall
//         .connect(signers.bob)
//         .createNewOrder(pk_bob, "jinitaimei", "trashcoal", 10, 100, 100, 10);
//     console.log(pk_bob, ",", "jinitaimei", ",", "trashcoal", ",", 10, ",", 100, ",", 100, ",", 10);
//     const deploylogs_launcherbob = await tx_bob.wait();
//     const addressauctioninstance = await deploylogs_launcherbob.logs[0].args[1];
//     return [addressauctioninstance, addressauctioncall, addressbob];
// }
