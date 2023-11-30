// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;

//import "./OrderMarket.sol";
import "fhevm/lib/TFHE.sol";
import "hardhat/console.sol";

// FIXME:如何在后端加入publickey？
contract AuctionOrder {
    // 本合约用于构造拍卖订单的实例，卖方向中心（以./OrderMarket.sol为中心合约）传递订单相关参数后创建本合约。
    // 本合约创建后，买方只与本合约交互，进行报价、撤回报价等操作；报价时间截止后卖方进行报价锁定以及密文比价，最终获得拍卖结果。
    enum OrderState {
        OPEN,
        CLOSED,
        CANCELLED,
        UNSOLD,
        COMPLETED
    }

    struct OrderDetail {
        // 定义结构体OrderDetail：通过创建拍卖订单时传递的参数构建，是拍卖订单对卖方可见和可参考的主要细节。
        string orderinfo; // OrderInfo：卖方描述本拍卖订单的自定义文字信息，如题目、描述及其他非结构化细节。
        string coalCategory; // Coal_Category：煤炭种类。
        uint256 reservePrice; // Reserve_PriceInUnit：单位底价。
        uint256 quantity; // Quantity：拍卖总数量。
        uint256 minimalClaimQuantity; // Minimalsplit：最小可认领/可分拆数量，规定该值不超过拍卖总数量；小于拍卖总数量时为可拆分订单，否则为不可拆分订单。
        uint256 launchTime; // Launch_Time：拍卖开始时间。
        uint256 closeTime; // Deadline：拍卖截止时间。
    }

    struct Bidding {
        // 定义结构体Bidding：规定买方报价的基本信息。
        euint32 price; // PriceInUnit：单位报价。
        euint32 quantity; // Quantity：认领/分拆数量。
        uint256 time; // Bidding_Time：报价时间。
        bool liveness; // Liveness：记录买方在此拍卖订单中是否有过报价记录。
    }

    struct IndexedBiddingPacked {
        //定义结构体ExtractedFinal：在密文比价中需要对报价信息进行线性化，通过此结构体进行线性化密文的记录。
        euint8 index; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 bidding; // Linearized_Ciphertext：线性化后的密文。
    }

    struct IndexedBidding {
        euint8 index; // Bidder_Cindex：报价者在此拍卖订单中依照时间排列的序号。
        euint32 price;
        euint32 quantity;
    }

    struct IndexedBiddingSerialized {
        // 定义结构体TopBidder4seller：用于记录以卖方公钥重加密后的头部报价密文。
        bytes index; // Bidder_index：报价者在此拍卖订单中依照时间排列的序号。
        bytes price;
        bytes quantity;
    }

    struct Bidder {
        address addr; // Bidder_Address：买方地址。
        bytes32 publickey; // Bidder_publickey：买方公钥。
    }

    address public owner; // 全局变量_owner：用于指示卖方地址。
    address public marketAddress; // 全局变量address_auctioncall：用于指示中心合约地址。
    address private marketOwner; // 全局变量address_centeradmin：用于指示中心管理员地址。
    OrderState public state;
    uint8 truncationNum;
    uint8 public currentBidderIndex;
    uint8 public winnersNum;
    uint32 QUANTITYRANGE = 65536;
    bytes32 ownerPublickey;
    mapping(address => Bidding) public biddingMap; // 定义Biddinglist用于报价环节中买方报价状态的更新。
    OrderDetail public orderDetail; // 全局变量orderDetail：用于存储买方可见的订单细节。
    Bidder[] public bidderList; // 定义BiddingAddress用于存储与拍卖订单交互的买方地址，与Biddinglist配合便于锁价后对所有待排序订单的预处理。
    IndexedBidding[] indexedBiddingList;
    IndexedBiddingPacked[] public indexedBiddingPackedList;

    event CancelEvent(string cancelMsg);
    event ClosedEvent(string closedMsg);
    event UnsoldEvent(string unsoldMsg);
    event CompletedEvent(string completedMsg);
    event BidEvent(string bidMsg);
    event ErrorOpenEvent(string errorOpenMsg);
    event ErrorClosedEvent(string errorClosedMsg);
    event ErrorCompletedEvent(string errorCompletedMsg);

    modifier onlyOwner() {
        // 判断是否由卖方本人直接调用。
        require(msg.sender == owner, "You are not the creator of this auction contract.");
        _;
    }

    modifier onlyBidder() {
        // 防止卖方本人直接或间接调用的修饰符，主要用于避免卖方对报价环节的干涉。
        require(
            tx.origin != owner && tx.origin != marketOwner,
            "The creator himself and the transaction center should not interfere in the procedure of bidding."
        );
        _;
    }

    modifier onlyMarket() {
        // 判断是否由卖方本人通过中心合约进行调用。
        require(tx.origin == owner && msg.sender == marketAddress, "You are not the creator of this auction contract.");
        _;
    }

    modifier isOpen() {
        // 用于检查拍卖订单是否处于报价进行环节。该修饰符主要用于买方报价或撤销报价时检查其操作合法性，只有在拍卖未截止时（即报价进行环节）买方才能进行以上操作；
        // !!!!!!!需要注意!!!!!!!，此修饰符未设置错误触发，因此买方若在拍卖截止后调用与此修饰符修饰的函数时不会产生回滚，因而可能存在少量损失；建议买方在客户端严格跟踪拍卖订单的截止时间，避免错误调用。
        // 此处为设置触发的解释如下：拍卖停止接收报价的判断——即全局变量auction_state的修改需要通过外部调用才能触发，如果仅通过auction_state本身作为修饰条件则会因为修改延迟的问题带来不合法报价操作的隐患。
        // 在本合约中有四种渠道触发auction_state的修改：
        // 1、卖方根据全局变量Deadline，及时调用FindWinner进行锁价，这是因为FindWinner将以AuctionOff来修饰，在拍卖截止时间确实已经达到的前提下能够安全修改全局变量auction_state；
        // 2、卖方撤回订单，则auction_state自然安全地修改为false；
        // 3、对isAuctioninProgress函数的调用可以通过查询的方式修改auction_state；
        // 4、买方在拍卖截止时间确实已经达到的前提下，在以上三种情况未发生时进行违规的报价或撤销报价操作，此时auction_state的修改必须要被动触发，以防状态修改延迟带来的不合法操作。
        // 在auction_state被动触发的意义下，无法通过回滚来触发错误，否则状态修改失败。
        // 如果通过报错的方式回滚，虽然此时买方的违规操作仍然无法实现，但是auction_state仍可读为true，这对于其它买方可能会产生信息误导；而不回滚带来的调用损失可以视作是对买方违规操作的惩罚。
        refreshState();
        if (state == OrderState.OPEN) {
            _;
        } else {
            emit ErrorOpenEvent(
                "The auction is not receiving biddings and therefore should be locked then. Your operations failed."
            );
            return;
        }
    }

    modifier hasClosed() {
        // 用于检查拍卖订单是否已经截止，如果确实超过了截止时间，则auction_state修改为false，此时本合约不再接受新的订单。
        refreshState();
        if (state == OrderState.CLOSED) {
            _;
        } else {
            emit ErrorClosedEvent("The auction hasn't been closed yet. Your operations failed.");
            return;
        }
    }

    modifier hasCompleted() {
        // 用于检查拍卖订单是否已经截止，如果确实超过了截止时间，则auction_state修改为false，此时本合约不再接受新的订单。
        refreshState();
        if (state == OrderState.COMPLETED) {
            _;
        } else {
            emit ErrorCompletedEvent("The auction hasn't been settled yet. Your operations failed.");
            return;
        }
    }

    modifier onlyEOA() {
        // 用于检查调用者与交易来源是否一致，此方法用于防止外包合约的攻击，在该修饰符下，函数调用必须直接由外部账户来进行，不能够通过合约来间接调用。
        require(msg.sender == tx.origin, "You are not an externally owned account in Ethereum.");
        _;
    }

    modifier firstBid() {
        require(!biddingMap[msg.sender].liveness, "You can only raise one bidding on this auction.");
        _;
    }

    constructor(OrderDetail memory _orderDetail, bytes32 _publickey, address _marketOwner) {
        // 合约构造函数，通过./OrderMarket.sol的createNewOrder函数中传递的参数_orderDetail来创建拍卖订单。
        orderDetail = _orderDetail; // 将参数_orderDetail写入全局变量orderDetail，记录订单可视细节。
        marketAddress = msg.sender; // 将创建此合约的地址（即createNewOrder所在的实例合约）写入全局变量address_auctioncall，作为本合约的中心合约地址。
        owner = tx.origin; // 将createNewOrder的调用者地址写入全局变量_owner，作为本合约的创建者，即拍卖订单的卖方。
        //require(AddressFromPublicKey(_publickey) == _owner, "The public key is not the address of the owner.");
        ownerPublickey = _publickey; // 将createNewOrder的调用者公钥写入全局变量owner_publickey，记录拍卖订单的卖方公钥。
        truncationNum = uint8(orderDetail.quantity / orderDetail.minimalClaimQuantity);
        marketOwner = _marketOwner;
        state = OrderState.OPEN;
        for (uint8 i = 0; i < truncationNum; i++) {
            indexedBiddingPackedList.push(IndexedBiddingPacked(TFHE.asEuint8(0), TFHE.asEuint32(0)));
        }
    }

    function cancelOrder() public onlyOwner isOpen {
        // 卖方撤回本合约代表的拍卖，此方法只能由卖方通过中心合约的finalizeOrder进行消息调用。
        (bool cancelled, ) = marketAddress.call(
            abi.encodeWithSignature("finalizeOrder(string)", "Invalid cancellation.")
        );
        require(cancelled, "The call of retract has failed.");
        state = OrderState.CANCELLED;
        emit CancelEvent("The auction has been retracted by the launcher.");
    }

    function refreshState() public returns (OrderState) {
        // 检查拍卖状态的核心函数，如果订单处于不可变状态则直接返回auction_state，否则检查拍卖截止时间是否已到，若到则调整状态为closed。
        // CheckState还可以用于整个拍卖流程的状态控制流，其它public函数在调用时可以根据调用CheckState的修饰符控制。
        if (state != OrderState.CANCELLED || state != OrderState.UNSOLD || state != OrderState.COMPLETED) {
            if (state != OrderState.CLOSED && block.timestamp > orderDetail.closeTime) {
                state = OrderState.CLOSED;
                emit ClosedEvent("The auction has been closed.");
            }
            return state;
        }
        return state;
    }

    function bid(
        // 买方调用的核心函数，用于发起报价。RaiseBidding接受序列化的密文bytes作为参数，包括单位报价和认领数量。
        // 函数具有四个修饰符，分别表征函数需要在拍卖未截止、不经过外包调用、非卖方本人调用以及拍卖未撤回的前提下才能被调用。
        bytes memory _price,
        bytes memory _quantity,
        bytes32 _publickey
    ) external onlyBidder onlyEOA isOpen firstBid {
        euint32 ePrice = TFHE.asEuint32(_price); // 将单位报价的密文bytes转化为euint32类型的密文。
        euint32 eClaimQuantity = TFHE.asEuint32(_quantity); // 将认领数量的密文bytes转化为euint32类型的密文。
        euint32 eReservePrice = TFHE.asEuint32(orderDetail.reservePrice); // 将拍卖订单中单位底价的明文转化为euint32类型的密文。
        euint32 eQuantity = TFHE.asEuint32(orderDetail.quantity); // 将拍卖订单中总数量的明文转化为euint32类型的密文。
        euint32 eMinimalClaimQuantity = TFHE.asEuint32(orderDetail.minimalClaimQuantity); // 将拍卖订单中最小认领数量的明文转化为euint32类型的密文。
        ebool conditionPrice = TFHE.ge(ePrice, eReservePrice); // 构造密文条件，判断单位报价是否大于等于拍卖订单中单位底价。
        ebool conditionEnoughQuantity = TFHE.le(eClaimQuantity, eQuantity); // 构造密文条件，判断认领数量是否小于等于拍卖订单中总数量。
        ebool conditionClaimQuantity = TFHE.le(eMinimalClaimQuantity, eClaimQuantity); // 构造密文条件，判断认领数量是否大于等于拍卖订单中最小认领数量。
        ebool conditionQuantity = TFHE.and(conditionEnoughQuantity, conditionClaimQuantity);
        // 结合以上两条构造密文条件，判断买方认领数量是否满足拍卖订单要求；注意到创建订单阶段已在./OrderMarket.sol中约束了订单最小认领数量与总数量的关系。
        require( // 判断买方单位报价是否满足拍卖订单要求。
            TFHE.decrypt(conditionPrice),
            "The price for the current bidding is invalid, your state of bidding remains unchanged."
        );
        //FIXME:少帮交易中心省事儿；
        require( // 判断买方认领数量是否满足拍卖订单要求。
            TFHE.decrypt(conditionQuantity),
            "The quantity for the current bidding is invalid, your state of bidding remains unchanged."
        );
        euint32 packedCipher = TFHE.add(TFHE.mul(ePrice, QUANTITYRANGE), eClaimQuantity);
        bidderList.push(Bidder(msg.sender, _publickey));
        biddingMap[msg.sender] = Bidding(ePrice, eClaimQuantity, block.timestamp, true);
        insertBidding(TFHE.asEuint8(currentBidderIndex), packedCipher);
        currentBidderIndex++;
        emit BidEvent("Someone bidded on the auction.");
        // 将上述转化后的满足报价条件的买方报价信息存储至Biddinglist中，如果买方此前已有报价，则可以通过此方法覆盖，
        // Biddinglist中只会记录一个关于该买方的报价信息。
    }

    function complete() public onlyOwner hasClosed {
        // 卖方锁价并执行密文比价得到拍卖结果的核心函数，要求只有卖方本人能够发起锁价，并且此时拍卖已经截止且未被撤回该函数执行的主要原理如下：
        // 1、由拍卖订单信息计算订单最大分拆数TrunctionNumber，初始化一个长度为TrunctionNumber的数组SortedFinalBiddings；
        // 2、对BiddingAddress调用List_Sorting进行排序，此时BiddingAddress中的买方地址将按照对应Bidding_Time的顺序按优先级排序，且每个买方地址都对应有效报价;
        // 3、依次（由List_Sorting的排列）将BiddingAddress中出现的买方地址取出，在Biddinglist映射中读取密文报价信息，将该信息整合为线性化密文；
        // 4、将取出的线性化密文依次与已排序的线性化密文比较，通过cmux方法依照密文比较结果更新SortedFinalBiddings;
        // 5、SortedFinalBiddings排序完成后，将其各项密文重加密为卖方可解密的密文，并将BiddingAddress的结果返回给卖方供其解密Bidder_index的参考。
        // 计算订单最大分拆数TrunctionNumber。
        if (currentBidderIndex == 0) {
            (bool unsold, ) = marketAddress.call(
                abi.encodeWithSignature("finalizeOrder(string)", "Invalid finalization.")
            );
            require(unsold, "The call of retract has failed.");
            state = OrderState.UNSOLD;
            emit UnsoldEvent("No qualified biddings received and the auction has ended with no winners.");
            return;
        }
        euint8 theNumber = TFHE.asEuint8(0);
        euint32 accumulatedQuantity = TFHE.asEuint32(0);
        euint32 eQuantity = TFHE.asEuint32(orderDetail.quantity);
        IndexedBiddingPacked[] memory biddingTmp = new IndexedBiddingPacked[](truncationNum);
        for (uint l = 0; l < truncationNum; l++) {
            biddingTmp[l] = indexedBiddingPackedList[truncationNum - l - 1];
            (euint32 parsedPrice, euint32 parsedQuantity) = unpackBidding(biddingTmp[l].bidding);
            accumulatedQuantity = TFHE.add(accumulatedQuantity, parsedQuantity);
            console.log("now have accumulated: ", TFHE.decrypt(accumulatedQuantity));
            ebool flag = TFHE.ge(eQuantity, accumulatedQuantity);
            theNumber = TFHE.cmux(flag, TFHE.add(theNumber, TFHE.asEuint8(1)), theNumber);
            indexedBiddingList.push(IndexedBidding(indexedBiddingPackedList[l].index, parsedPrice, parsedQuantity));
        }
        winnersNum = TFHE.decrypt(theNumber);

        (bool completed, ) = marketAddress.call(
            abi.encodeWithSignature("finalizeOrder(string)", "Invalid finalization.")
        );
        require(completed, "The call of finalization has failed.");
        state = OrderState.COMPLETED;
        emit CompletedEvent(
            string.concat("The auction has ended with ", string(abi.encodePacked(winnersNum)), " winners.")
        );
    }

    function getTopBids() public onlyOwner hasCompleted returns (IndexedBiddingSerialized[] memory, address[] memory) {
        IndexedBiddingSerialized[] memory topBidders = new IndexedBiddingSerialized[](winnersNum);
        for (uint i = 0; i < winnersNum; i++) {
            topBidders[i] = IndexedBiddingSerialized(
                TFHE.reencrypt(indexedBiddingList[i].index, ownerPublickey),
                TFHE.reencrypt(indexedBiddingList[i].price, ownerPublickey),
                TFHE.reencrypt(indexedBiddingList[i].quantity, ownerPublickey)
            );
        }
        address[] memory topBidderAddresses = new address[](truncationNum);
        for (uint j = 0; j < truncationNum; j++) {
            topBidderAddresses[j] = bidderList[j].addr;
        }
        return (topBidders, topBidderAddresses);
    }

    function getQuantity() public hasCompleted returns (bytes memory) {
        bool existsFlag = false;
        uint myIndex;
        bytes32 myPublickey;
        for (uint i = 0; i < currentBidderIndex; i++) {
            if (msg.sender == bidderList[i].addr) {
                existsFlag = true;
                myIndex = i;
                myPublickey = bidderList[i].publickey;
                break;
            }
        }
        assert(myIndex >= 0 && myIndex < currentBidderIndex);
        require(existsFlag, "You are not a bidder in this auction.");
        euint8 eMyIndex = TFHE.asEuint8(myIndex);
        euint32 eMyQuantity = TFHE.asEuint32(0);
        for (uint j = 0; j < truncationNum; j++) {
            ebool isMyIndex = TFHE.eq(eMyIndex, indexedBiddingList[j].index);
            ebool winnerNecessity = TFHE.asEbool(j < winnersNum);
            eMyQuantity = TFHE.cmux(TFHE.and(isMyIndex, winnerNecessity), indexedBiddingList[j].quantity, eMyQuantity);
        }
        return TFHE.reencrypt(eMyQuantity, myPublickey);
    }

    function checktops(uint i) public view returns (uint8, uint32) {
        return (TFHE.decrypt(indexedBiddingPackedList[i].index), TFHE.decrypt(indexedBiddingPackedList[i].bidding));
    }

    function unpackBidding(euint32 _linearizedBidding) private view returns (euint32, euint32) {
        euint32 parsedQuantity = TFHE.rem(_linearizedBidding, QUANTITYRANGE);
        euint32 parsedPrice = TFHE.shr(_linearizedBidding, 16);
        return (parsedPrice, parsedQuantity);
    }

    // function test(bytes memory input) public view returns (uint32) {
    //     euint32 e1 = TFHE.rem(TFHE.asEuint32(input), 5);
    //     euint32 e2 = TFHE.shr(TFHE.asEuint32(input), 16);
    //     return (TFHE.decrypt(e2));
    // }

    function insertBidding(euint8 _cindex, euint32 _linearizedcipher) private {
        IndexedBiddingPacked[] memory insertinglist = new IndexedBiddingPacked[](truncationNum);
        ebool[] memory SortConditions = new ebool[](truncationNum);
        for (uint i = 0; i < truncationNum; i++) {
            insertinglist[i] = indexedBiddingPackedList[i];
            SortConditions[i] = TFHE.gt(_linearizedcipher, insertinglist[i].bidding);
        }
        for (uint t = 0; t < truncationNum; t++) {
            if (t == 0) {
                insertinglist[0] = IndexedBiddingPacked(
                    TFHE.cmux(SortConditions[0], _cindex, insertinglist[0].index),
                    TFHE.cmux(SortConditions[0], _linearizedcipher, insertinglist[0].bidding)
                );
            } else {
                IndexedBiddingPacked memory tmp = IndexedBiddingPacked(
                    TFHE.cmux(SortConditions[t], insertinglist[t].index, insertinglist[t - 1].index),
                    TFHE.cmux(SortConditions[t], insertinglist[t].bidding, insertinglist[t - 1].bidding)
                );
                insertinglist[t] = IndexedBiddingPacked(
                    TFHE.cmux(SortConditions[t], insertinglist[t - 1].index, insertinglist[t].index),
                    TFHE.cmux(SortConditions[t], insertinglist[t - 1].bidding, insertinglist[t].bidding)
                );
                insertinglist[t - 1] = tmp;
            }
        }
        for (uint i = 0; i < truncationNum; i++) {
            indexedBiddingPackedList[i] = insertinglist[i];
        }
    }

    function getWinnersNum() public view returns (euint8) {
        euint8 theNumber = TFHE.asEuint8(0);
        euint32 accumulatedQuantity = TFHE.asEuint32(0);
        euint32 eQuantity = TFHE.asEuint32(orderDetail.quantity);
        for (uint i = 0; i < truncationNum; i++) {
            accumulatedQuantity = TFHE.add(accumulatedQuantity, indexedBiddingList[i].quantity);
            ebool flag = TFHE.ge(eQuantity, accumulatedQuantity);
            theNumber = TFHE.cmux(flag, TFHE.add(theNumber, TFHE.asEuint8(1)), theNumber);
        }
        return theNumber;
    }
}
