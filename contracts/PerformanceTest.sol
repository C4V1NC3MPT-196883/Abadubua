// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;

//import "./OrderMarket.sol";
import "fhevm/lib/TFHE.sol";

contract PerformanceTest {
    euint32[] ECIPHERS;
    uint32 quantityrange = 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2;
    uint public BiddersNum;
    BidderInfo[] public BiddersInfoList;
    mapping(address => Bidding) public Biddinglist;
    bool[] public CONDITION;
    ExtractedFinal_parsed[] public SortedParsedBiddings;
    ExtractedFinal_linearized[] public SortedLinearizedBiddings1;
    uint tcn = 1;
    uint8 public cc1;
    uint32 public cc2;
    uint n = 17;

    constructor(uint price1, uint price2) {
        ECIPHERS.push(TFHE.asEuint32(price1));
        ECIPHERS.push(TFHE.asEuint32(price2));
    }

    function decryptt(bytes memory c) public view returns (uint) {
        euint32 cipher = TFHE.asEuint32(c);
        return TFHE.decrypt(cipher);
    }

    function compare(uint i, uint j) public view returns (bool) {
        return TFHE.decrypt(TFHE.gt(ECIPHERS[i], ECIPHERS[j]));
    }

    function addd(uint i, uint j) public view returns (uint) {
        return TFHE.decrypt(TFHE.add(ECIPHERS[i], ECIPHERS[j]));
    }

    function multt(uint i, uint j) public view returns (uint) {
        return TFHE.decrypt(TFHE.mul(ECIPHERS[i], ECIPHERS[j]));
    }

    function cmuxx(uint i, uint j) public returns (euint32) {
        ebool cond = TFHE.le(ECIPHERS[i], ECIPHERS[j]);
        return TFHE.cmux(cond, ECIPHERS[i], ECIPHERS[j]);
    }

    function cmmmux() public {
        for (uint i = 0; i < n; i++) {
            TFHE.cmux(TFHE.asEbool(true), TFHE.asEuint32(i), TFHE.asEuint32(i + 1));
        }
    }

    function appendinglist(uint appendingnumber) public {
        ECIPHERS.push(TFHE.asEuint32(appendingnumber));
    }

    function whatispower(uint k) public pure returns (uint) {
        return 2 ^ k;
    }

    // function ParseComponents(euint32 _linearizedbidding) private view returns (euint32, euint32) {
    //     euint32 parsed_cquantity = TFHE.rem(_linearizedbidding, quantityrange);
    //     euint32 parsed_cpriceinunit = TFHE.div(TFHE.sub(_linearizedbidding, parsed_cquantity), quantityrange);
    //     return (parsed_cpriceinunit, parsed_cquantity);
    // }

    function pars(bytes memory c1, bytes memory c2) public view returns (uint, uint) {
        euint32 cipher1 = TFHE.asEuint32(c1);
        euint32 cipher2 = TFHE.asEuint32(c2);
        euint32 cipher = TFHE.add(TFHE.mul(cipher1, TFHE.asEuint32(quantityrange)), cipher2);
        (euint32 parsed_cpriceinunit, euint32 parsed_cquantity) = ParseComponents(cipher);
        return (TFHE.decrypt(parsed_cpriceinunit), TFHE.decrypt(parsed_cquantity));
    }

    function MakeList() public {
        List_Sorting(); // 调用List_Sorting对BiddingAddress进行（依照Bidding_Time）的排序和无效订单的过滤。
        BiddersNum = BiddersInfoList.length;
        ExtractedFinal_linearized[] memory SortedLinearizedBiddings = new ExtractedFinal_linearized[](tcn);
        for (uint8 i = 0; i < tcn; i++) {
            // 初始化SortedFinalBiddings，长度为3，初始化的Linearized_Ciphertext为0的密文（最小值）。
            SortedLinearizedBiddings[i] = ExtractedFinal_linearized(TFHE.asEuint8(0), TFHE.asEuint32(0));
        }
        for (uint j = 0; j < BiddersNum; j++) {
            // 依次取出BiddingAddress中的买方地址进行线性化密文的比较。
            Bidding memory currentbidding = Biddinglist[BiddersInfoList[j].Bidder_Address]; // 读取买方地址对应的拍卖订单信息，注意到买方地址一定对应Biddinglist中的有效报价。
            euint32 currentlinearizedbidding = CipherLinearization(currentbidding); // 通过当前读取的拍卖订单信息计算线性化密文。
            ebool[] memory SortConditions = new ebool[](tcn); // 初始化一个临时密文条件数组，记录密文比较结果，最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint k = 0; k < tcn; k++) {
                // 依次将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings。
                SortConditions[k] = TFHE.gt(
                    currentlinearizedbidding,
                    SortedLinearizedBiddings[k].Linearized_Ciphertext
                );
            }
            //SortConditions[3] = TFHE.asEbool(false); // 最后一个元素为false（即线性化密文一定不会和最后一个元素交换）。
            for (uint t = 0; t < tcn; t++) {
                // 根据SortConditions中的密文比较结果更新SortedFinalBiddings。
                if (t == 0) {
                    SortedLinearizedBiddings[0] = ExtractedFinal_linearized(
                        TFHE.cmux(SortConditions[0], TFHE.asEuint8(j), SortedLinearizedBiddings[0].Bidder_Cindex),
                        TFHE.cmux(
                            SortConditions[0],
                            currentlinearizedbidding,
                            SortedLinearizedBiddings[0].Linearized_Ciphertext
                        )
                    );
                } else {
                    ExtractedFinal_linearized memory tmp = ExtractedFinal_linearized(
                        TFHE.cmux(
                            SortConditions[t],
                            SortedLinearizedBiddings[t].Bidder_Cindex,
                            SortedLinearizedBiddings[t - 1].Bidder_Cindex
                        ),
                        TFHE.cmux(
                            SortConditions[t],
                            SortedLinearizedBiddings[t].Linearized_Ciphertext,
                            SortedLinearizedBiddings[t - 1].Linearized_Ciphertext
                        )
                    );
                    SortedLinearizedBiddings[t] = ExtractedFinal_linearized(
                        TFHE.cmux(
                            SortConditions[t],
                            SortedLinearizedBiddings[t - 1].Bidder_Cindex,
                            SortedLinearizedBiddings[t].Bidder_Cindex
                        ),
                        TFHE.cmux(
                            SortConditions[t],
                            SortedLinearizedBiddings[t - 1].Linearized_Ciphertext,
                            SortedLinearizedBiddings[t].Linearized_Ciphertext
                        )
                    );
                    SortedLinearizedBiddings[t - 1] = tmp;
                }
            }
        }

        cc1 = TFHE.decrypt(SortedLinearizedBiddings[1].Bidder_Cindex);
        cc2 = TFHE.decrypt(SortedLinearizedBiddings[1].Linearized_Ciphertext);
    }

    function apendbl(bytes memory _priceinunit, bytes memory _quantity, bytes32 _publickey) public {
        (euint32 epriceinunit, euint32 equantity) = (TFHE.asEuint32(_priceinunit), TFHE.asEuint32(_quantity));
        Biddinglist[msg.sender] = Bidding(epriceinunit, equantity, block.timestamp, true);
        BiddersInfoList.push(BidderInfo(msg.sender, _publickey));
    }

    function List_Sorting() private {
        uint lengthoflist = BiddersInfoList.length;
        if (lengthoflist == 0 || lengthoflist == 1) {
            return;
        }
        uint nullindex = lengthoflist; // 定义nullindex作为标记位来记录排序后最大的对应Bidding_Time为0的地址，方便后续将nullindex之前（包含）的所有买方地址删除。初始化为不在列表中的最小位置。
        uint poptimes = 0;
        for (uint i = 0; i < lengthoflist; i++) {
            // 关于明文报价时间的属性进行选择排序。
            uint flagindex = i;
            uint exchangedtime = Biddinglist[BiddersInfoList[flagindex].Bidder_Address].Bidding_Time; // 定义flagindex作为选择排序的临时标记位，用于记录未排序元素中对应Bidding_Time最小的地址位置。
            for (uint j = i + 1; j < lengthoflist; j++) {
                // 未排序的元素从第j + 1个位置开始。
                if (
                    Biddinglist[BiddersInfoList[j].Bidder_Address].Bidding_Time <
                    Biddinglist[BiddersInfoList[flagindex].Bidder_Address].Bidding_Time
                ) {
                    flagindex = j; // 更新当前已检查到的未排序元素中对应Bidding_Time最小的地址位置。
                }
            }
            if (flagindex != i) {
                // 只有flagindex与i位置不同时（即存在比第i个位置对应的Bidding_Time小的未排序元素）才进行交换。
                BidderInfo memory tmp1 = BiddersInfoList[flagindex];
                exchangedtime = Biddinglist[tmp1.Bidder_Address].Bidding_Time;
                BidderInfo memory tmp2 = BiddersInfoList[i];
                BiddersInfoList[i] = tmp1;
                BiddersInfoList[flagindex] = tmp2;
            }
            if (exchangedtime != type(uint256).max) {
                // 交换后，检查被交换的对应Bidding_Time最小项是否为0，若为0，则更新nullindex；这表明到目前为止nullindex之前（包含）的所有买方地址都对应无效报价。
                nullindex = i;
            }
        }
        if (Biddinglist[BiddersInfoList[0].Bidder_Address].Bidding_Time == type(uint256).max) {
            poptimes = lengthoflist;
            while (poptimes != 0) {
                BiddersInfoList.pop();
                poptimes--;
            }
            return;
        }

        poptimes = lengthoflist - nullindex - 1;
        while (poptimes != 0) {
            BiddersInfoList.pop();
            poptimes--;
        }
        //for (uint k = 0; k < lengthoflist - nullindex - 1; k++) {
        //    BidderInfo memory tmp3 = BiddersInfoList[k + nullindex + 1];
        //    BiddersInfoList[k] = tmp3;
        //}
    }

    function CipherLinearization(Bidding memory bidding) private view returns (euint32) {
        // 定义一个私有函数，用于将报价信息中的多属性密文转化为线性化后的密文，将优先级较高的属性放置到高位时需要对低位属性的长度进行扩展补偿，此处设置低位的数量属性补偿为16位。
        euint32 conpensatedprice = TFHE.mul(bidding.PriceInUnit, TFHE.asEuint32(quantityrange)); // 将买方单位报价平移16位至高位。
        return TFHE.add(conpensatedprice, bidding.Quantity);
    }

    function ParseComponents(euint32 _linearizedbidding) private view returns (euint32, euint32) {
        euint32 parsed_cquantity = TFHE.rem(_linearizedbidding, quantityrange);
        euint32 parsed_cpriceinunit = TFHE.div(TFHE.sub(_linearizedbidding, parsed_cquantity), quantityrange);
        return (parsed_cpriceinunit, parsed_cquantity);
    }

    struct Bidding {
        // 定义结构体Bidding：规定买方报价的基本信息。
        euint32 PriceInUnit; // PriceInUnit：单位报价。
        euint32 Quantity; // Quantity：认领/分拆数量。
        uint256 Bidding_Time; // Bidding_Time：报价时间。
        bool Liveness; // Liveness：记录买方在此拍卖订单中是否有过报价记录，此布尔值主要为便于锁价而设置。
    }

    struct BidderInfo {
        address Bidder_Address; // Bidder_Address：买方地址。
        bytes32 Bidder_Publickey; // Bidder_publickey：买方公钥。
    }

    struct ExtractedFinal_linearized {
        //定义结构体ExtractedFinal：在密文比价中需要对报价信息进行线性化，通过此结构体进行线性化密文的记录。
        euint8 Bidder_Cindex; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 Linearized_Ciphertext; // Linearized_Ciphertext：线性化后的密文。
    }

    struct ExtractedFinal_parsed {
        euint8 Bidder_Cindex; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 Parsed_Cpriceinunit;
        euint32 Parsed_Cquantity;
    }
}
