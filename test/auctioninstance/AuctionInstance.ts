import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { getDefaultProvider } from "ethers";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";
import { machine } from "os";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { getnewcontractfromdeploy, uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

//import { uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

describe("AuctionInstance", function () {
    before(async function () {
        this.signers = await getSigners(ethers);
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

    it("shouldn't retract when the auction has closed", async function () {
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const tx = await this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
        const receipttx = await tx.wait();
        console.log(receipttx.logs);
        //expect(receipttx.logs[0].args[0]).to.equal("The auction has been closed.");
        // expect(await this.InstanceContract.connect(this.signers.bob).RetractMyAuction())
        //     //expect(await (await this.InstanceContract.connect(this.signers.bob).RetractMyAuction()).wait())
        //     .to.emit(this.InstanceContract, "ClosedEvent")
        //     .withArgs();
        //FIXME:还没弄清楚.emit的用法
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
            const setpriceinunitbytes_carol = this.instances.alice.encrypt32(15);
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
            await expect(await (await raiseabidding_carol).wait()).to.emit(this.InstanceContract, "BidEvent");
        });
    });

    it("correct retraction", async function () {
        // Carlo want to retract Bob's auction, this should be rejected!
        await expect(this.InstanceContract.connect(this.signers.carol).RetractMyAuction()).to.be.rejectedWith(
            "You are not the creator of this auction contract.",
        );

        // Now Bob retract his auction.
        const tx = await this.InstanceContract.connect(this.signers.bob).RetractMyAuction();
        await tx.wait();

        // should set the  state of this auction to retracted.
        const get_state = await this.InstanceContract.CheckState();
        expect(await this.InstanceContract.currentstate()).to.equal(2);

        //TODO: Bob want to retract again
    });
});
