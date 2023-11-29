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
import { createTransaction } from "../utils";
import { getnewcontractfromdeploy, uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

// pnpm fhevm:faucet:alice && pnpm fhevm:faucet:bob && pnpm fhevm:faucet:carol && pnpm fhevm:faucet:dave && pnpm fhevm:faucet:eve && pnpm fhevm:faucet:fraud && pnpm fhevm:faucet:grace && pnpm fhevm:faucet:hausdorff
// pnpm fhevm:faucet:once4all

describe("AuctionInstance", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
        this.timeout(180000); // 设置每条测试上限为3分钟。
    });

    beforeEach(async function () {
        this.timeout(180000); // 设置每条测试上限为3分钟。
        [this.contractAddress, this.callcontractAddress, this.callbobAddress] = await getnewcontractfromdeploy();
        this.InstanceContract = await ethers.getContractAt("AuctionInstance", this.contractAddress);
        this.instances = await createInstances(this.contractAddress, ethers, this.signers);
    });

    it("correct initialization?", async function () {
        expect(await this.InstanceContract.owner()).to.equal(this.callbobAddress);
        expect(await this.InstanceContract.address_auctioncall()).to.equal(this.callcontractAddress);
        expect(await this.InstanceContract.currentstate()).to.equal(0);
        expect(await this.InstanceContract.BiddersNum()).to.equal(0);

        const [detail0, detail1, detail2, detail3, detail4, detail5, detail6] =
            await this.InstanceContract.orderdetail();
        expect([detail0, detail1, detail2, detail3, detail4, detail6 - detail5]).to.deep.equal([
            "jinitaimei",
            "trashcoal",
            10,
            100,
            10,
            15,
        ]);
    });

    it("should successfully update state to closed", async function () {
        const checkfirst = await this.InstanceContract.connect(this.signers.dave).StateRefresh();
        await checkfirst.wait();
        expect(await this.InstanceContract.currentstate()).to.equal(0);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const checksecond = await this.InstanceContract.connect(this.signers.carol).StateRefresh();
        await checksecond.wait();
        expect(await this.InstanceContract.currentstate()).to.equal(1);
    });

    describe("everything about auction retraction.", function () {
        it("shouldn't retract when the auction has closed", async function () {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            const tx = await this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
            const currentstateinfo = await this.InstanceContract.currentstate();
            if (currentstateinfo == 0) {
                await expect(tx.wait())
                    .to.emit(this.InstanceContract, "ClosedEvent")
                    .withArgs("The auction has been closed.");
            }
            expect(await this.InstanceContract.currentstate()).to.equal(1);
        });

        it("shouldn't retract when not the creator", async function () {
            const tx = this.InstanceContract.connect(this.signers.eve).RetractMyAuction();
            await expect(tx).to.be.rejectedWith("You are not the creator of this auction contract.");
        });

        it("correct retraction by bob himself and the twice retraction will effect nothing", async function () {
            // Bob retract his auction.
            const tx = this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
            await (await tx).wait();

            // should set the  state of this auction to retracted
            expect(await this.InstanceContract.currentstate()).to.equal(2);

            // Still, others cannot retract the auction.
            const ttx = this.InstanceContract.connect(this.signers.eve).RetractMyAuction();
            await expect(ttx).to.be.rejectedWith("You are not the creator of this auction contract.");

            // Now, Bob wants to retract twice.
            const tttx = this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
            await expect((await tttx).wait())
                .to.emit(this.InstanceContract, "ErrorOnEvent")
                .withArgs(
                    "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
                );
        });
    });

    // it("fail to bid when wrong quantity", async function () {
    //     const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
    //     const setquantitybytes_carol = this.instances.carol.encrypt32(101);
    //     const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(this.contractAddress)!.publicKey;
    //     const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
    //     const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
    //         setpriceinunitbytes_carol,
    //         setquantitybytes_carol,
    //         pk_carol,
    //     );
    //     console.log((await (await raiseabidding_carol).wait()).logs);
    // });

    describe("everything about bidding", async function () {
        it("successfully raise a bidding", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            await expect(await (await raiseabidding_carol).wait())
                .to.emit(this.InstanceContract, "BidEvent")
                .withArgs("Someone bidded on the auction.");
            console.log(await this.InstanceContract.BiddersInfoList(0));
            console.log(await this.InstanceContract.Biddinglist(this.signers.carol.address));
        });

        it("the seller cannot raise a bidding", async function () {
            const setpriceinunitbytes_bob = this.instances.bob.encrypt32(15);
            const setquantitybytes_bob = this.instances.bob.encrypt32(90);
            const publickeyforbob_uint8array = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
            const pk_bob = uint8ArrayToBytes32(publickeyforbob_uint8array);
            const raiseabidding_bob = this.InstanceContract.connect(this.signers.bob).RaiseBidding(
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
            const raiseabidding_alice = this.InstanceContract.connect(this.signers.alice).RaiseBidding(
                setpriceinunitbytes_alice,
                setquantitybytes_alice,
                pk_alice,
            );
            await expect(raiseabidding_alice).to.be.rejectedWith(
                "The creator himself and the transaction center should not interfere in the procedure of bidding.",
            );
        });

        it("cannot raise a bidding when the auction is closed", async function () {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            const setpriceinunitbytes_fraud = this.instances.fraud.encrypt32(15);
            const setquantitybytes_fraud = this.instances.fraud.encrypt32(90);
            const publickeyforfraud_uint8array = this.instances.fraud.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_fraud = uint8ArrayToBytes32(publickeyforfraud_uint8array);
            const raiseabidding_fraud = this.InstanceContract.connect(this.signers.fraud).RaiseBidding(
                setpriceinunitbytes_fraud,
                setquantitybytes_fraud,
                pk_fraud,
            );
            await expect((await raiseabidding_fraud).wait())
                .to.emit(this.InstanceContract, "ErrorOnEvent")
                .withArgs(
                    "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
                );
        });

        it("successfully retract a bidding", async function () {
            // 大约7秒完成一次bidding，测试时建议调整时间长度。 FIXME:将时间调整为30秒以上，且Biddinglist调整为public之后可以测试FIXME:
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            await expect(await (await raiseabidding_carol).wait())
                .to.emit(this.InstanceContract, "BidEvent")
                .withArgs("Someone bidded on the auction.");
            const setpriceinunitbytes_grace = this.instances.grace.encrypt32(15);
            const setquantitybytes_grace = this.instances.grace.encrypt32(90);
            const publickeyforgrace_uint8array = this.instances.grace.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_grace = uint8ArrayToBytes32(publickeyforgrace_uint8array);
            const raiseabidding_grace = this.InstanceContract.connect(this.signers.grace).RaiseBidding(
                setpriceinunitbytes_grace,
                setquantitybytes_grace,
                pk_grace,
            );
            await expect(await (await raiseabidding_grace).wait())
                .to.emit(this.InstanceContract, "BidEvent")
                .withArgs("Someone bidded on the auction.");

            // Carol try to retract her bidding after the former two raised biddings.
            const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
            await (await retractbidding_carol).wait();
            expect((await this.InstanceContract.Biddinglist(this.signers.carol.address))[3]).to.equal(false);
            //FIXME:下面的先不删
            // console.log((await this.InstanceContract.orderdetail())[6]);
            // console.log(await this.InstanceContract.BiddersInfoList(0), await this.InstanceContract.BiddersInfoList(1));
            // console.log(await this.InstanceContract.Biddinglist(this.signers.carol.address));
            // console.log(await this.InstanceContract.Biddinglist(this.signers.grace.address));
        });

        it("bidding retraction should not success when the auction has been closed", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            await expect(await (await raiseabidding_carol).wait())
                .to.emit(this.InstanceContract, "BidEvent")
                .withArgs("Someone bidded on the auction.");
            await new Promise((res) => setTimeout(res, 15000));
            const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
            await expect((await retractbidding_carol).wait())
                .to.emit(this.InstanceContract, "ErrorOnEvent")
                .withArgs(
                    "The auction is not receiving biddings and therefore should be locked then. Your operations failed.",
                );
        });

        it("cannot retract a bidding twice or retract an unexisting bidding", async function () {
            const setpriceinunitbytes_carol = this.instances.carol.encrypt32(15);
            const setquantitybytes_carol = this.instances.carol.encrypt32(90);
            const publickeyforcarol_uint8array = this.instances.carol.getTokenSignature(
                this.contractAddress,
            )!.publicKey;
            const pk_carol = uint8ArrayToBytes32(publickeyforcarol_uint8array);
            const raiseabidding_carol = this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                setpriceinunitbytes_carol,
                setquantitybytes_carol,
                pk_carol,
            );
            await (await raiseabidding_carol).wait();
            const retractbidding_carol = this.InstanceContract.connect(this.signers.carol).RetractBidding();
            await (await retractbidding_carol).wait();
            const retractbidding_carol2 = this.InstanceContract.connect(this.signers.carol).RetractBidding();
            await expect(retractbidding_carol2).to.be.rejectedWith(
                "Currently you have no biddings recorded on the auction.",
            );

            const retractbidding_dave = this.InstanceContract.connect(this.signers.dave).RetractBidding();
            await expect(retractbidding_dave).to.be.rejectedWith(
                "Currently you have no biddings recorded on the auction.",
            );
        });
    });

    describe("everything about PrivacyPreservingOrdering", function () {
        // FIXME:至少设为120秒的拍卖时长FIXME:
        before(async function () {
            this.timeout(180000); // 设置每条测试上限为3分钟。
        });
        beforeEach(async function () {
            // &carol& -- dave -- eve -- eve2 -- fraud -- dave retract -- &grace& -- eve retract -- &hausdorff& -- &dave& -- fraud2 -- &eve3& -- fraud retract -- israel -- jewish
            this.timeout(180000); // 设置每条测试上限为3分钟。
            // console.log(await ethers.provider.getBalance(this.signers.alice.address));
            // console.log(await ethers.provider.getBalance(this.signers.bob.address));
            // console.log(await ethers.provider.getBalance(this.signers.carol.address));
            // console.log(await ethers.provider.getBalance(this.signers.dave.address));
            // console.log(await ethers.provider.getBalance(this.signers.eve.address));
            // console.log(await ethers.provider.getBalance(this.signers.fraud.address));
            // console.log(await ethers.provider.getBalance(this.signers.grace.address));
            // console.log(await ethers.provider.getBalance(this.signers.hausdorff.address));
            // console.log(await ethers.provider.getBalance(this.signers.israel.address));
            // console.log(await ethers.provider.getBalance(this.signers.jewish.address));
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
                this.instances.eve.encrypt32(20),
                this.instances.eve.encrypt32(100),
                uint8ArrayToBytes32(this.instances.eve.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_eve2, setquantitybytes_eve2, publickeyforeve_uint8array2] = [
                this.instances.eve.encrypt32(15),
                this.instances.eve.encrypt32(90),
                uint8ArrayToBytes32(this.instances.eve.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_eve3, setquantitybytes_eve3, publickeyforeve_uint8array3] = [
                this.instances.eve.encrypt32(10),
                this.instances.eve.encrypt32(60),
                uint8ArrayToBytes32(this.instances.eve.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_fraud, setquantitybytes_fraud, publickeyforfraud_uint8array] = [
                this.instances.fraud.encrypt32(24),
                this.instances.fraud.encrypt32(50),
                uint8ArrayToBytes32(this.instances.fraud.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            const [setpriceinunitbytes_fraud2, setquantitybytes_fraud2, publickeyforfraud_uint8array2] = [
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

            await // &carol&
            (
                await this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                    setpriceinunitbytes_carol,
                    setquantitybytes_carol,
                    publickeyforcarol_uint8array,
                )
            ).wait();
            console.log("finished carol");
            await // dave
            (
                await this.InstanceContract.connect(this.signers.dave).RaiseBidding(
                    setpriceinunitbytes_dave,
                    setquantitybytes_dave,
                    publickeyfordave_uint8array,
                )
            ).wait();
            console.log("finished dave");
            await // eve
            (
                await this.InstanceContract.connect(this.signers.eve).RaiseBidding(
                    setpriceinunitbytes_eve,
                    setquantitybytes_eve,
                    publickeyforeve_uint8array,
                )
            ).wait();
            console.log("finished eve");
            await // eve2
            (
                await this.InstanceContract.connect(this.signers.eve).RaiseBidding(
                    setpriceinunitbytes_eve2,
                    setquantitybytes_eve2,
                    publickeyforeve_uint8array2,
                )
            ).wait();
            console.log("finished eve2");
            await // fraud
            (
                await this.InstanceContract.connect(this.signers.fraud).RaiseBidding(
                    setpriceinunitbytes_fraud,
                    setquantitybytes_fraud,
                    publickeyforfraud_uint8array,
                )
            ).wait();
            console.log("finished fraud");
            await (await this.InstanceContract.connect(this.signers.dave).RetractBidding()).wait(); // dave retract
            console.log("dave retracted");
            await // &grace&
            (
                await this.InstanceContract.connect(this.signers.grace).RaiseBidding(
                    setpriceinunitbytes_grace,
                    setquantitybytes_grace,
                    publickeyforgrace_uint8array,
                )
            ).wait();
            console.log("finished grace");
            await (await this.InstanceContract.connect(this.signers.eve).RetractBidding()).wait(); // eve retract
            console.log("eve retracted");
            await // &hausdorff&
            (
                await this.InstanceContract.connect(this.signers.hausdorff).RaiseBidding(
                    setpriceinunitbytes_hausdorff,
                    setquantitybytes_hausdorff,
                    publickeyforhausdorff_uint8array,
                )
            ).wait();
            console.log("finished hausdorff");
            await // &dave&
            (
                await this.InstanceContract.connect(this.signers.dave).RaiseBidding(
                    setpriceinunitbytes_dave,
                    setquantitybytes_dave,
                    publickeyfordave_uint8array,
                )
            ).wait();
            console.log("finished dave");
            await // fraud2
            (
                await this.InstanceContract.connect(this.signers.fraud).RaiseBidding(
                    setpriceinunitbytes_fraud2,
                    setquantitybytes_fraud2,
                    publickeyforfraud_uint8array2,
                )
            ).wait();
            console.log("finished fraud2");
            await // &eve3&
            (
                await this.InstanceContract.connect(this.signers.eve).RaiseBidding(
                    setpriceinunitbytes_eve3,
                    setquantitybytes_eve3,
                    publickeyforeve_uint8array3,
                )
            ).wait();
            console.log("finished eve3");
            await (await this.InstanceContract.connect(this.signers.fraud).RetractBidding()).wait(); // fraud retract
            console.log("fraud retracted");
            await // israel
            (
                await this.InstanceContract.connect(this.signers.israel).RaiseBidding(
                    setpriceinunitbytes_israel,
                    setquantitybytes_israel,
                    publickeyforisrael_uint8array,
                )
            ).wait();
            console.log("finished israel");
            await // jewish
            (
                await this.InstanceContract.connect(this.signers.jewish).RaiseBidding(
                    setpriceinunitbytes_jewish,
                    setquantitybytes_jewish,
                    publickeyforjewish_uint8array,
                )
            ).wait();
            console.log("finished jewish");
        });

        it("test beforeEach bidding situation", async function () {
            // FIXME:需要在设置BiddersInfoList和BiddingList为public后才能测试FIXME:
            for (let i = 0; i < 6; i++) {
                console.log(await this.InstanceContract.BiddersInfoList(i));
            }
            console.log(
                "for carol: address = ",
                this.signers.carol.address,
                await this.InstanceContract.Biddinglist(this.signers.carol.address),
            );
            console.log(
                "for dave: address = ",
                this.signers.dave.address,
                await this.InstanceContract.Biddinglist(this.signers.dave.address),
            );
            console.log(
                "for eve: address = ",
                this.signers.eve.address,
                await this.InstanceContract.Biddinglist(this.signers.eve.address),
            );
            console.log(
                // expect to false
                "for fraud: address = ",
                this.signers.fraud.address,
                await this.InstanceContract.Biddinglist(this.signers.fraud.address),
            );
            console.log(
                "for grace: address = ",
                this.signers.grace.address,
                await this.InstanceContract.Biddinglist(this.signers.grace.address),
            );
            console.log(
                "for hausdorff: address = ",
                this.signers.hausdorff.address,
                await this.InstanceContract.Biddinglist(this.signers.hausdorff.address),
            );
            console.log(
                "for bob: address = ",
                this.signers.bob.address,
                await this.InstanceContract.Biddinglist(this.signers.bob.address),
            );
            console.log(
                "for israel: address = ",
                this.signers.israel.address,
                await this.InstanceContract.Biddinglist(this.signers.israel.address),
            );
            console.log(await this.InstanceContract.Biddinglist(this.signers.israel.address));
            console.log(await this.InstanceContract.Biddinglist(this.signers.jewish.address));
        });

        it("should only be called by the seller", async function () {
            console.log("the auction will be closed at: ", (await this.InstanceContract.orderdetail())[6]);
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            while (
                (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp <
                (await this.InstanceContract.orderdetail())[6]
            ) {
                continue;
            }
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            await expect(
                this.InstanceContract.connect(this.signers.israel).PrivacyPreservingOrdering(),
            ).to.be.rejectedWith("You are not the creator of this auction contract.");
        });

        it("should not be called when the auction is still on", async function () {
            await expect((await this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering()).wait())
                .to.emit(this.InstanceContract, "ErrorClosedEvent")
                .withArgs("The auction hasn't been closed yet. Your operations failed.");
        });

        it("check global variables after PPO", async function () {
            this.timeout(180000);
            const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
                method: TypedContractMethod<A>,
                ...params: A
            ) => {
                //const gasLimit = await method.estimateGas(...params);
                const updatedParams: ContractMethodArgs<A> = [...params, { gasLimit: 9900000 }];
                return method(...updatedParams);
            };

            console.log("the auction will be closed at: ", (await this.InstanceContract.orderdetail())[6]);
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            while (
                (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp <
                (await this.InstanceContract.orderdetail())[6]
            ) {
                continue;
            }
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            //const finishthisauction = this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering();
            const finishthisauction = createTransaction(
                this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering,
            );
            // await expect(finishthisauction).to.be.rejected;
            // console.log(typeof (await finishthisauction));
            console.log(await (await finishthisauction).wait());
            console.log((await (await finishthisauction).wait()).logs);
            //await (await finishthisauction).wait();
            console.log(await this.InstanceContract.BiddersNum());
        });
    });

    describe("test fewer members", function () {
        // FIXME:至少设为120秒的拍卖时长FIXME:
        before(async function () {
            this.timeout(600000);
        });
        beforeEach(async function () {
            this.timeout(600000); // 设置每条测试上限为3分钟。
            const [setpriceinunitbytes_carol, setquantitybytes_carol, publickeyforcarol_uint8array] = [
                uint8ArrayToBytes32(this.instances.carol.encrypt32(15)),
                uint8ArrayToBytes32(this.instances.carol.encrypt32(100)),
                uint8ArrayToBytes32(this.instances.carol.getTokenSignature(this.contractAddress)!.publicKey),
            ];
            console.log(setpriceinunitbytes_carol, ",", setquantitybytes_carol, ",", publickeyforcarol_uint8array);
            // const [setpriceinunitbytes_dave, setquantitybytes_dave, publickeyfordave_uint8array] = [
            //     this.instances.dave.encrypt32(12),
            //     this.instances.dave.encrypt32(100),
            //     uint8ArrayToBytes32(this.instances.dave.getTokenSignature(this.contractAddress)!.publicKey),
            // ];
            await // &carol&
            (
                await this.InstanceContract.connect(this.signers.carol).RaiseBidding(
                    setpriceinunitbytes_carol,
                    setquantitybytes_carol,
                    publickeyforcarol_uint8array,
                )
            ).wait();
            console.log("finished carol");
            // await // dave
            // (
            //     await this.InstanceContract.connect(this.signers.dave).RaiseBidding(
            //         setpriceinunitbytes_dave,
            //         setquantitybytes_dave,
            //         publickeyfordave_uint8array,
            //     )
            // ).wait();
            // console.log("finished dave");
            for (let i = 0; i < 1; i++) {
                console.log(await this.InstanceContract.BiddersInfoList(i));
            }
            console.log(
                "for carol: address = ",
                this.signers.carol.address,
                await this.InstanceContract.Biddinglist(this.signers.carol.address),
            );
            // console.log(
            //     "for dave: address = ",
            //     this.signers.dave.address,
            //     await this.InstanceContract.Biddinglist(this.signers.dave.address),
            // );
        });
        it("test for test", async function () {
            this.timeout(120000);
            console.log(this.timeout());
            const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
                method: TypedContractMethod<A>,
                ...params: A
            ) => {
                //const gasLimit = await method.estimateGas(...params);
                const updatedParams: ContractMethodArgs<A> = [...params, { gasLimit: 9900000 }];
                return method(...updatedParams);
            };

            console.log("the auction will be closed at: ", (await this.InstanceContract.orderdetail())[6]);
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            while (
                (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp <
                (await this.InstanceContract.orderdetail())[6]
            ) {
                continue;
            }
            console.log((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
            //const finishthisauction = this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering();
            const finishthisauction = createTransaction(
                this.InstanceContract.connect(this.signers.bob).PrivacyPreservingOrdering,
            );
            //const hashing = (await (await finishthisauction).wait())?.hash;
            // await expect(finishthisauction).to.be.rejected;
            //console.log(await finishthisauction);
            console.log(await (await finishthisauction).wait());
            // console.log(hashing);
            // //console.log((await (await finishthisauction).wait()).logs);
            // //await (await finishthisauction).wait();
            // //console.log(await this.InstanceContract.BiddersNum());
            // const trace = await ethers.provider.send("debug_traceTransaction", [hashing]);
            // console.log(trace);
        });
        it("debug", async function () {
            const trace = await ethers.provider.send("debug_traceTransaction", [
                "0xef354ac9cc31057872427a08dfa61f406b0d4045b43a3965569ded08224e3169",
            ]);
            console.log(trace);
        });
    });
});
