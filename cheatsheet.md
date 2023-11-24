<p align="center">
<img width=400 src="./cavempt.jpeg" />
</p>
<hr/>
<p align="center">
  <a href="./fhevm-whitepaper.pdf"> 📃 Read white paper</a> |<a href="https://docs.zama.ai/fhevm"> 📒 Read documentation</a> | <a href="https://zama.ai/community"> 💛 Community support</a>
</p>
<p align="center">
<!-- Version badge using shields.io -->
  <a href="https://github.com/zama-ai/fhevm/releases">
    <img src="https://img.shields.io/github/v/release/zama-ai/fhevm?style=flat-square">
  </a>
<!-- Zama Bounty Program -->
  <a href="https://github.com/zama-ai/bounty-program">
    <img src="https://img.shields.io/badge/Contribute-Zama%20Bounty%20Program-yellow?style=flat-square">
  </a>
</p>
<hr/>

## Promise

- `Promise`是一个异步操作的对象，它可以用来处理异步操作的结果。具有三个枚举状态，分别是`pending`，`fulfilled`和`rejected`。
- 枚举状态只能从`pending`变成`fulfilled`或`rejected`。
- 一个已定义的`Promise`中有两个函数`resolve`和`reject`，分别用于将`Promise`的状态从`pending`变成`fulfilled`或`rejected`。
- 一个异步函数`async function`的返回值是一个`Promise`类型。
- 如果函数$f$的返回值是`Promise`类型，那么异步状态下直接获取函数的输出将是一个`pending`状态的`Promise`；如果`await`获取函数的输出那么`Promise`的状态将是`fulfilled`或`rejected`，并根据`resolve`或`reject`对$f$的实参得到的输出来决定最终的输出。
- `Promise`类型也可以通过`.then`和`.catch`方法来处理异步操作的结果，得到如上的输出。

## ethers中的实例

- 以下是`carol`调用`this.InstanceContract`的方法`RaiseBidding`的示例，以下内容是一个`Promise`的示例，此时它处于`pending`状态。
```typescript 
this.InstanceContract.connect(this.signers.carol).RaiseBidding(
  setpriceinunitbytes_carol,
  setquantitybytes_carol,
  pk_carol,
);
  ```
- 以上的例子中，如果添加一个`await`，那么`Promise`的状态将是`fulfilled`或`rejected`。在本例中，这个`Promise`在`await`之后将会`fulfilled`为一个`ContractTransactionResponse`类型的输出。
```typescript
await this.InstanceContract.connect(this.signers.carol).RaiseBidding(
    setpriceinunitbytes_carol,
    setquantitybytes_carol,
    pk_carol,
)
```
- 进一步，在ethers中一个`ContractTransactionResponse`类型可以通过`.wait()`方法得到一个`Promise<null|ContractTransactionReceipt>`的类型，这个Promise类型将在`await`之后被`resolve`得到一个`null`或者`ContractTransactionReceipt`的类型：
```typescript
(await this.InstanceContract.connect(this.signers.carol).RaiseBidding(
    setpriceinunitbytes_carol,
    setquantitybytes_carol,
    pk_carol,
)).wait();
```
- 上面的`Promise<null|ContractTransactionReceipt>`在`await`之后得到了一个`ContractTransactionReceipt`类型的输出，这是因为`.wait()`方法可以接受两个参数：`confirms?: number`和`timeout?: number`；前者默认值为`1`，当只有一个输入时默认为`confirm`的值。具体而言，当`confirms`不为`0`时，在`confirms`个包含了该调用交易的区块产生后（或timeout毫秒时间后）会`fulfilled`为一个`ContractTransactionReceipt`类型的输出，包含了该交易在链上的详细信息。以下是`await`后这个`Promise`类型`fulfilled`的`ContractTransactionReceipt`。
```typescript
await (
    await this.InstanceContract.connect(this.signers.carol).RaiseBidding(
        setpriceinunitbytes_carol,
        setquantitybytes_carol,
        pk_carol,
    )
).wait(),
```
- 在终端输出中，以上的`ContractTransactionReceipt`的具体信息如下，注意到此时`status: 0`表明该交易已经被`revert`（否则为`1`）：
```bash
ContractTransactionReceipt {
  provider: HardhatEthersProvider {
    _hardhatProvider: BackwardsCompatibilityProviderAdapter {
      _wrapped: [ChainIdValidatorProvider],
      _provider: [ChainIdValidatorProvider],
      sendAsync: [Function: bound sendAsync],
      send: [Function: bound send],
      _sendJsonRpcRequest: [Function: bound _sendJsonRpcRequest] AsyncFunction
    },
    _networkName: 'local',
    _blockListeners: [],
    _transactionHashListeners: Map(0) {},
    _eventListeners: [],
    _isHardhatNetworkCached: false,
    _transactionHashPollingInterval: undefined
  },
  to: '0x5A2D8d2632BD38A4C089919e6Cce1a3288FAfaF2',
  from: '0x5e0B3ecb6EBb6AE9437780E35A1C6262E9E702b4',
  contractAddress: null,
  hash: '0xfbf6c0790d5ed58149ef856af78e919d23db9c0e4e25e0c1d8be8d17b4582bf5',
  index: 0,
  blockHash: '0x22253a5e328ef266a8802c6e4455d52c50d9e1e767ed5840f23d7ef620df1410',
  blockNumber: 943,
  logsBloom: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  gasUsed: 626821n,
  cumulativeGasUsed: 626821n,
  gasPrice: 0n,
  type: 0,
  status: 0,
  root: undefined
}
```