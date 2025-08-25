export default [
  {
    type: "function",
    name: "getUniversalAccount",
    stateMutability: "view",
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_destinationChainId", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createUniversalAccount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_destinationChainId", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;
