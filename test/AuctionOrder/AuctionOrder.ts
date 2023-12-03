import { mine, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { getDefaultProvider } from "ethers";
import { ContractMethodArgs, Typed } from "ethers";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import { machine } from "os";

import { TypedContractMethod } from "../../types/common";
import { createInstances } from "../instance";
import { getSigners } from "../signers";
//import { createTransaction } from "../utils";
import { getnewcontractfromdeploy, uint8ArrayToBytes32 } from "./AuctionOrder.fixture";

// pnpm fhevm:faucet:alice && pnpm fhevm:faucet:bob && pnpm fhevm:faucet:carol && pnpm fhevm:faucet:dave && pnpm fhevm:faucet:eve && pnpm fhevm:faucet:fraud && pnpm fhevm:faucet:grace && pnpm fhevm:faucet:hausdorff
// pnpm fhevm:faucet:once4all

const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
    method: TypedContractMethod<A>,
    ...params: A
) => {
    //const gasLimit = await method.estimateGas(...params);
    const updatedParams: ContractMethodArgs<A> = [...params, { gasLimit: 100000000 }];
    return method(...updatedParams);
};

describe("AuctionOrder", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
        this.timeout(180000); // 设置每条测试上限为3分钟。
    });

    beforeEach(async function () {
        this.timeout(180000); // 设置每条测试上限为3分钟。
        [this.contractAddress, this.callcontractAddress, this.callbobAddress] = await getnewcontractfromdeploy();
        this.InstanceContract = await ethers.getContractAt("AuctionOrder", this.contractAddress);
        this.instances = await createInstances(this.contractAddress, ethers, this.signers);
    });

    it("correct initialization?", async function () {
        // 至多创建约40个分拆；
        expect(await this.InstanceContract.owner()).to.equal(this.callbobAddress);
        expect(await this.InstanceContract.marketAddress()).to.equal(this.callcontractAddress);
        expect(await this.InstanceContract.state()).to.equal(0);
        expect(await this.InstanceContract.currentBidderIndex()).to.equal(0);

        const [detail0, detail1, detail2, detail3, detail4, detail5, detail6] =
            await this.InstanceContract.orderDetail();
        expect([detail0, detail1, detail2, detail3, detail4, detail6 - detail5]).to.deep.equal([
            "jinitaimei",
            "trashcoal",
            10,
            100,
            3,
            15,
        ]);

        // console.log(await this.InstanceContract.Biddinglist(this.signers.carol.address));
        // console.log(await this.InstanceContract.checktops(0));
        // console.log(await this.InstanceContract.checktops(1));
        // console.log(await this.InstanceContract.checktops(2));
        // console.log(await this.InstanceContract.checktops(3));
        // console.log(await this.InstanceContract.checktops(4));
        // console.log(await this.InstanceContract.checktops(5));
        // console.log(await this.InstanceContract.checktops(6));
        // console.log(await this.InstanceContract.checktops(7));
        // console.log(await this.InstanceContract.checktops(8));
        // console.log(await this.InstanceContract.checktops(9));
    });

    it("should successfully update state to closed", async function () {
        const checkfirst = await this.InstanceContract.connect(this.signers.dave).refreshState();
        await checkfirst.wait();
        expect(await this.InstanceContract.state()).to.equal(0);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const checksecond = await this.InstanceContract.connect(this.signers.carol).refreshState();
        await checksecond.wait();
        expect(await this.InstanceContract.state()).to.equal(1);
    });

    describe("everything about auction retraction.", function () {
        it("shouldn't retract when the auction has closed", async function () {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            const tx = await this.InstanceContract.connect(this.signers.bob).cancelOrder();
            const currentstateinfo = await this.InstanceContract.state();
            if (currentstateinfo == 0) {
                await expect(tx.wait())
                    .to.emit(this.InstanceContract, "ClosedEvent")
                    .withArgs("The auction has been closed.");
            }
            expect(await this.InstanceContract.state()).to.equal(1);
        });

        it("shouldn't retract when not the creator", async function () {
            const tx = this.InstanceContract.connect(this.signers.eve).cancelOrder();
            await expect(tx).to.be.rejectedWith("You are not the creator of this auction contract.");
        });

        it("correct retraction by bob himself and the twice retraction will effect nothing", async function () {
            // Bob retract his auction.
            const tx = this.InstanceContract.connect(this.signers.bob).cancelOrder();
            await (await tx).wait();

            // should set the  state of this auction to retracted
            expect(await this.InstanceContract.state()).to.equal(2);

            // Still, others cannot retract the auction.
            const ttx = this.InstanceContract.connect(this.signers.eve).cancelOrder();
            await expect(ttx).to.be.rejectedWith("You are not the creator of this auction contract.");

            // Now, Bob wants to retract twice.
            const tttx = this.InstanceContract.connect(this.signers.bob).cancelOrder();
            await expect((await tttx).wait())
                .to.emit(this.InstanceContract, "ErrorOpenEvent")
                .withArgs(
                    "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
                );
        });
    });

    describe("everything about bidding", async function () {
        it("successfully raise a bidding", async function () {
            this.timeout(600000);
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = createTransaction(
                this.InstanceContract.connect(this.signers.carol).bid,
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            console.log(await (await raiseabidding_carol).wait());
            await expect(await (await raiseabidding_carol).wait())
                .to.emit(this.InstanceContract, "BidEvent")
                .withArgs("Someone bidded on the auction.");
            console.log(await this.InstanceContract.bidderList(0));
            console.log(await this.InstanceContract.biddingMap(this.signers.carol.address));
            console.log(await this.InstanceContract.checktops(0));
            console.log(await this.InstanceContract.checktops(1));
            console.log(await this.InstanceContract.checktops(2));
            console.log(await this.InstanceContract.checktops(3));
            expect(await this.InstanceContract.currentBidderIndex()).to.equal(1);
            expect((await this.InstanceContract.biddingMap(this.signers.carol.address))[3]).to.equal(true);
        });

        it("the seller cannot raise a bidding", async function () {
            const setpriceinunitbytes_bob = this.instances.bob.encrypt32(15);
            const setquantitybytes_bob = this.instances.bob.encrypt32(90);
            const publickeyforbob_uint8array = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
            const pk_bob = uint8ArrayToBytes32(publickeyforbob_uint8array);
            const raiseabidding_bob = this.InstanceContract.connect(this.signers.bob).bid(
                setpriceinunitbytes_bob,
                setquantitybytes_bob,
                pk_bob,
            );
            await expect(raiseabidding_bob).to.be.rejectedWith(
                "The creator himself and the transaction center should not interfere in the procedure of bidding.",
            );
        });

        it("the centeradmin cannot raise a bidding", async function () {
            const setpriceinunitbytes_alice = this.instances.alice.encrypt32(15);
            const setquantitybytes_alice = this.instances.alice.encrypt32(90);
            const publickeyforalice_uint8array = this.instances.alice.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_alice = uint8ArrayToBytes32(publickeyforalice_uint8array);
            const raiseabidding_alice = this.InstanceContract.connect(this.signers.alice).bid(
                setpriceinunitbytes_alice,
                setquantitybytes_alice,
                pk_alice,
            );
            await expect(raiseabidding_alice).to.be.rejectedWith(
                "The creator himself and the transaction center should not interfere in the procedure of bidding.",
            );
        });

        it("cannot raise a bidding when the auction is closed", async function () {
            //duration设为15秒
            await new Promise((resolve) => setTimeout(resolve, 15000));
            const setpriceinunitbytes_fraud = this.instances.fraud.encrypt32(15);
            const setquantitybytes_fraud = this.instances.fraud.encrypt32(90);
            const publickeyforfraud_uint8array = this.instances.fraud.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_fraud = uint8ArrayToBytes32(publickeyforfraud_uint8array);
            const raiseabidding_fraud = this.InstanceContract.connect(this.signers.fraud).bid(
                setpriceinunitbytes_fraud,
                setquantitybytes_fraud,
                pk_fraud,
            );
            await expect((await raiseabidding_fraud).wait())
                .to.emit(this.InstanceContract, "ErrorOpenEvent")
                .withArgs(
                    "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
                );
        });

        it("cannot bid twice", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).bid(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            await (await raiseabidding_carol).wait();
            const setpriceinunitbytes_carol2 = this.instances.carol.encrypt32(22);
            const setquantitybytes_carol2 = this.instances.carol.encrypt32(60);
            const publickeyforcarol_uint8array2 = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol2 = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol2 = this.InstanceContract.connect(this.signers.carol).bid(
                setpriceinunitbytes_carol2,
                setquantitybytes_carol2,
                pk_carol2,
            );
            await expect(raiseabidding_carol2).to.be.rejectedWith("You can only raise one bidding on this auction.");
        });

        it("fail to bid when wrong price", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(1);
            const setquantitybytes_carol = this.instances.carol.encrypt32(60);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).bid(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            expect((await (await raiseabidding_carol).wait()).status).to.equal(0);
            expect(await this.InstanceContract.biddingMap(this.signers.carol.address)).to.deep.equal([0, 0, 0, false]);
            expect(await this.InstanceContract.currentBidderIndex()).to.equal(0);
        });

        it("fail to bid when wrong quantity", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(20);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).bid(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            expect((await (await raiseabidding_carol).wait()).status).to.equal(0);
            expect(await this.InstanceContract.biddingMap(this.signers.carol.address)).to.deep.equal([0, 0, 0, false]);
            expect(await this.InstanceContract.currentBidderIndex()).to.equal(0);

            const setpriceinunitbytes_israel = this.instances.israel.encrypt32(15);
            const setquantitybytes_israel = this.instances.israel.encrypt32(200);
            const publickeyforisrael_uint8array = this.instances.israel.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_israel = uint8ArrayToBytes32(publickeyforisrael_uint8array);
            const raiseabidding_israel = this.InstanceContract.connect(this.signers.israel).bid(
                setpriceinunitbytes_israel,
                setquantitybytes_israel,
                pk_israel,
            );
            expect((await (await raiseabidding_israel).wait()).status).to.equal(0);
            expect(await this.InstanceContract.biddingMap(this.signers.israel.address)).to.deep.equal([0, 0, 0, false]);
            expect(await this.InstanceContract.currentBidderIndex()).to.equal(0);
        });

        // it("successfully retract a bidding", async function () {
        //     // 大约7秒完成一次bidding，测试时建议调整时间长度。 FIXME:将时间调整为30秒以上，且Biddinglist调整为public之后可以测试FIXME:
        //     const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
        //     const setquantitybytes_carol = this.instances.carol.encrypt32(90);
        //     const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
        //         this.contractAddress,
        //     )!.publicKey;
        //     const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
        //     const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
        //         setpriceinunitbytes_carol,
        //         setquantitybytes_carol,
        //         pk_carol,
        //     );
        //     await expect(await (await raiseabidding_carol).wait())
        //         .to.emit(this.InstanceContract, "BidEvent")
        //         .withArgs("Someone bidded on the auction.");
        //     const setpriceinunitbytes_grace = this.instances.grace.encrypt32(15);
        //     const setquantitybytes_grace = this.instances.grace.encrypt32(90);
        //     const publickeyforgrace_uint8array = this.instances.grace.getTokenSignature(
        //         this.contractAddress,
        //     )!.publicKey;
        //     const pk_grace = uint8ArrayToBytes32(publickeyforgrace_uint8array);
        //     const raiseabidding_grace = this.InstanceContract.connect(this.signers.grace).RaiseBidding(
        //         setpriceinunitbytes_grace,
        //         setquantitybytes_grace,
        //         pk_grace,
        //     );
        //     await expect(await (await raiseabidding_grace).wait())
        //         .to.emit(this.InstanceContract, "BidEvent")
        //         .withArgs("Someone bidded on the auction.");

        //     // Carol try to retract her bidding after the former two raised biddings.
        //     const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
        //     await (await retractbidding_carol).wait();
        //     expect((await this.InstanceContract.Biddinglist(this.signers.carol.address))[3]).to.equal(false);
        //     //FIXME:下面的先不删
        //     // console.log((await this.InstanceContract.orderDetail())[6]);
        //     // console.log(await this.InstanceContract.BiddersInfoList(0), await this.InstanceContract.BiddersInfoList(1));
        //     // console.log(await this.InstanceContract.Biddinglist(this.signers.carol.address));
        //     // console.log(await this.InstanceContract.Biddinglist(this.signers.grace.address));
        // });

        // it("bidding retraction should not success when the auction has been closed", async function () {
        //     const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
        //     const setquantitybytes_carol = this.instances.carol.encrypt32(90);
        //     const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
        //         this.contractAddress,
        //     )!.publicKey;
        //     const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
        //     const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
        //         setpriceinunitbytes_carol,
        //         setquantitybytes_carol,
        //         pk_carol,
        //     );
        //     await expect(await (await raiseabidding_carol).wait())
        //         .to.emit(this.InstanceContract, "BidEvent")
        //         .withArgs("Someone bidded on the auction.");
        //     await new Promise((res) => setTimeout(res, 15000));
        //     const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
        //     await expect((await retractbidding_carol).wait())
        //         .to.emit(this.InstanceContract, "ErrorOnEvent")
        //         .withArgs(
        //             "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
        //         );
        // });

        // it("cannot retract a bidding twice or retract an unexisting bidding", async function () {
        //     const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
        //     const setquantitybytes_carol = this.instances.carol.encrypt32(90);
        //     const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
        //         this.contractAddress,
        //     )!.publicKey;
        //     const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
        //     const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
        //         setpriceinunitbytes_carol,
        //         setquantitybytes_carol,
        //         pk_carol,
        //     );
        //     await (await raiseabidding_carol).wait();
        //     const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
        //     await (await retractbidding_carol).wait();
        //     const retractbidding_carol2 = this.InstanceContract.connect(this.signers.carol).RetractBidding();
        //     await expect(retractbidding_carol2).to.be.rejectedWith(
        //         "Currently you have no biddings recorded on the auction.",
        //     );

        //     const retractbidding_dave = this.InstanceContract.connect(this.signers.dave).RetractBidding();
        //     await expect(retractbidding_dave).to.be.rejectedWith(
        //         "Currently you have no biddings recorded on the auction.",
        //     );
        // });
    });

    describe("everything about complete", function () {
        // FIXME:至少设为120秒的拍卖时长FIXME:
        before(async function () {
            this.timeout(180000); // 设置每条测试上限为3分钟。
        });
        beforeEach(async function () {
            // fraud(20,30)(3,1310750) -- hausdorff(17,30)(5,1114142) -- carol(15,40)(0,983080) -- grace(14,30)
            this.timeout(300000); // 设置每条测试上限为5分钟。
            console.log(this.timeout());
            const [setpriceinunitbytes_carol, setquantitybytes_carol, publickeyforcarol_uint8array] = [
                this.instances.carol.encrypt32(15),
                this.instances.carol.encrypt32(40),
                uint8ArrayToBytes32(this.instances.carol.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_dave, setquantitybytes_dave, publickeyfordave_uint8array] = [
                this.instances.dave.encrypt32(12),
                this.instances.dave.encrypt32(45),
                uint8ArrayToBytes32(this.instances.dave.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_eve, setquantitybytes_eve, publickeyforeve_uint8array] = [
                this.instances.eve.encrypt32(10),
                this.instances.eve.encrypt32(60),
                uint8ArrayToBytes32(this.instances.eve.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_fraud, setquantitybytes_fraud, publickeyforfraud_uint8array] = [
                this.instances.fraud.encrypt32(20),
                this.instances.fraud.encrypt32(30),
                uint8ArrayToBytes32(this.instances.fraud.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_grace, setquantitybytes_grace, publickeyforgrace_uint8array] = [
                this.instances.grace.encrypt32(14),
                this.instances.grace.encrypt32(30),
                uint8ArrayToBytes32(this.instances.grace.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_hausdorff, setquantitybytes_hausdorff, publickeyforhausdorff_uint8array] = [
                this.instances.hausdorff.encrypt32(17),
                this.instances.hausdorff.encrypt32(30),
                uint8ArrayToBytes32(this.instances.hausdorff.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_israel, setquantitybytes_israel, publickeyforisrael_uint8array] = [
                this.instances.israel.encrypt32(15),
                this.instances.israel.encrypt32(120),
                uint8ArrayToBytes32(this.instances.israel.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_jewish, setquantitybytes_jewish, publickeyforjewish_uint8array] = [
                this.instances.jewish.encrypt32(1),
                this.instances.jewish.encrypt32(90),
                uint8ArrayToBytes32(this.instances.jewish.getTokenSignature(this.contractAddress)!.publicKey),
            ];

            await // carol
            (
                await this.InstanceContract.connect(this.signers.carol).bid(
                    setpriceinunitbytes_carol,
                    setquantitybytes_carol,
                    publickeyforcarol_uint8array,
                )
            ).wait();
            console.log("finished carol");
            await // dave
            (
                await this.InstanceContract.connect(this.signers.dave).bid(
                    setpriceinunitbytes_dave,
                    setquantitybytes_dave,
                    publickeyfordave_uint8array,
                )
            ).wait();
            console.log("finished dave");
            await // eve
            (
                await this.InstanceContract.connect(this.signers.eve).bid(
                    setpriceinunitbytes_eve,
                    setquantitybytes_eve,
                    publickeyforeve_uint8array,
                )
            ).wait();
            console.log("finished eve");
            await // fraud
            (
                await this.InstanceContract.connect(this.signers.fraud).bid(
                    setpriceinunitbytes_fraud,
                    setquantitybytes_fraud,
                    publickeyforfraud_uint8array,
                )
            ).wait();
            console.log("finished fraud");
            await // grace
            (
                await this.InstanceContract.connect(this.signers.grace).bid(
                    setpriceinunitbytes_grace,
                    setquantitybytes_grace,
                    publickeyforgrace_uint8array,
                )
            ).wait();
            console.log("finished grace");
            await // hausdorff
            (
                await this.InstanceContract.connect(this.signers.hausdorff).bid(
                    setpriceinunitbytes_hausdorff,
                    setquantitybytes_hausdorff,
                    publickeyforhausdorff_uint8array,
                )
            ).wait();
            console.log("finished hausdorff");
            await // israel
            (
                await this.InstanceContract.connect(this.signers.israel).bid(
                    setpriceinunitbytes_israel,
                    setquantitybytes_israel,
                    publickeyforisrael_uint8array,
                )
            ).wait();
            console.log("finished israel");
            await // jewish
            (
                await this.InstanceContract.connect(this.signers.jewish).bid(
                    setpriceinunitbytes_jewish,
                    setquantitybytes_jewish,
                    publickeyforjewish_uint8array,
                )
            ).wait();
            console.log("finished jewish");
        });

        it("test beforeEach bidding situation", async function () {
            // FIXME:需要在设置BiddersInfoList和BiddingList为public后才能测试FIXME:
            this.timeout(300000);
            for (let i = 0; i < 6; i++) {
                console.log(await this.InstanceContract.bidderList(i));
            }
            console.log(
                "for carol: address = ",
                this.signers.carol.address,
                await this.InstanceContract.biddingMap(this.signers.carol.address),
            );
            console.log(
                "for dave: address = ",
                this.signers.dave.address,
                await this.InstanceContract.biddingMap(this.signers.dave.address),
            );
            console.log(
                "for eve: address = ",
                this.signers.eve.address,
                await this.InstanceContract.biddingMap(this.signers.eve.address),
            );
            console.log(
                // expect to false
                "for fraud: address = ",
                this.signers.fraud.address,
                await this.InstanceContract.biddingMap(this.signers.fraud.address),
            );
            console.log(
                "for grace: address = ",
                this.signers.grace.address,
                await this.InstanceContract.biddingMap(this.signers.grace.address),
            );
            console.log(
                "for hausdorff: address = ",
                this.signers.hausdorff.address,
                await this.InstanceContract.biddingMap(this.signers.hausdorff.address),
            );
            console.log(
                "for bob: address = ",
                this.signers.bob.address,
                await this.InstanceContract.biddingMap(this.signers.bob.address),
            );
            console.log(
                "for israel: address = ",
                this.signers.israel.address,
                await this.InstanceContract.biddingMap(this.signers.israel.address),
            );
            console.log(
                "for jewish: address = ",
                this.signers.jewish.address,
                await this.InstanceContract.biddingMap(this.signers.jewish.address),
            );
            console.log(await this.InstanceContract.checktops(0));
            console.log(await this.InstanceContract.checktops(1));
            console.log(await this.InstanceContract.checktops(2));
            console.log(await this.InstanceContract.checktops(3));
        });

        it("should only be called by the seller", async function () {
            console.log("the auction will be closed at: ", (await this.InstanceContract.orderDetail())[6]);
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))?.timestamp);
            while (
                (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp <
                (await this.InstanceContract.orderDetail())[6]
            ) {
                continue;
            }
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))?.timestamp);
            await expect(this.InstanceContract.connect(this.signers.israel).complete()).to.be.rejectedWith(
                "You are not the creator of this auction contract.",
            );
        });

        it("should not be called when the auction is still on", async function () {
            await expect((await this.InstanceContract.connect(this.signers.bob).complete()).wait())
                .to.emit(this.InstanceContract, "ErrorClosedEvent")
                .withArgs("The auction hasn't been closed yet. Your operations failed.");
        });

        it.only("check global variables after completeness", async function () {
            this.timeout(600000);

            console.log("the auction will be closed at: ", (await this.InstanceContract.orderDetail())[6]);
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))?.timestamp);
            while (
                (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp <
                (await this.InstanceContract.orderDetail())[6]
            ) {
                continue;
            }
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))?.timestamp);
            //const finishthisauction = this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering();

            const finishthisauction = createTransaction(this.InstanceContract.connect(this.signers.bob).complete);
            console.log(await (await finishthisauction).wait());
            //console.log((await (await finishthisauction).wait())?.logs);
            console.log("auctionstate is : ", await this.InstanceContract.state());
            console.log(await this.InstanceContract.checktops(0), await this.InstanceContract.checktopss(4));
            console.log(await this.InstanceContract.checktops(1), await this.InstanceContract.checktopss(3));
            console.log(await this.InstanceContract.checktops(2), await this.InstanceContract.checktopss(2));
            console.log(await this.InstanceContract.checktops(3), await this.InstanceContract.checktopss(1));
            console.log(await this.InstanceContract.checktops(4), await this.InstanceContract.checktopss(0));

            console.log(await this.InstanceContract.currentBidderIndex());
            console.log(await this.InstanceContract.winnersNum());

            const bob_retrive = await this.InstanceContract.connect(this.signers.bob).getTopBids(
                this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey,
            );
            const carol_retrive = await this.InstanceContract.connect(this.signers.carol).getQuantity();
            const dave_retrive = await this.InstanceContract.connect(this.signers.dave).getQuantity();
            const eve_retrive = await this.InstanceContract.connect(this.signers.eve).getQuantity();
            const fraud_retrive = await this.InstanceContract.connect(this.signers.fraud).getQuantity();
            const grace_retrive = await this.InstanceContract.connect(this.signers.grace).getQuantity();
            const hausdorff_retrive = await this.InstanceContract.connect(this.signers.hausdorff).getQuantity();
            const israel_retrive = this.InstanceContract.connect(this.signers.israel).getQuantity();
            const jewish_retrive = this.InstanceContract.connect(this.signers.jewish).getQuantity();

            await expect(israel_retrive).to.be.rejectedWith("You are not a bidder in this auction.");
            await expect(jewish_retrive).to.be.rejectedWith("You are not a bidder in this auction.");
            console.log(
                "The quantity that carol gets: ",
                this.instances.carol.decrypt(this.contractAddress, carol_retrive),
            );
            console.log(
                "The quantity that dave gets: ",
                this.instances.dave.decrypt(this.contractAddress, dave_retrive),
            );
            console.log("The quantity that eve gets: ", this.instances.eve.decrypt(this.contractAddress, eve_retrive));
            console.log(
                "The quantity that fraud gets: ",
                this.instances.fraud.decrypt(this.contractAddress, fraud_retrive),
            );
            console.log(
                "The quantity that grace gets: ",
                this.instances.grace.decrypt(this.contractAddress, grace_retrive),
            );
            console.log(
                "The quantity that hausdorff gets: ",
                this.instances.hausdorff.decrypt(this.contractAddress, hausdorff_retrive),
            );

            console.log("Final results: ");
            const winnersnum = await this.InstanceContract.winnersNum();
            for (let i = 0; i < winnersnum; i++) {
                debugger;
                let index = this.instances.bob.decrypt(this.contractAddress, bob_retrive[0][i][0]);
                console.log("The address ", bob_retrive[1][index], "will get the following price and quantity:");
                console.log(
                    "price: ",
                    this.instances.bob.decrypt(this.contractAddress, bob_retrive[0][i][1]),
                    "quantity: ",
                    this.instances.bob.decrypt(this.contractAddress, bob_retrive[0][i][2]),
                );
            }
        });
    });
});
