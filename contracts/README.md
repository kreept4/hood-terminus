# Contracts

The launchpad, and the token it stamps out.

## Why Hardhat and not Foundry

Foundry is the better tool for this specific job: its invariant runner is what
protects a bonding curve holding other people's ETH. It officially wants WSL on
Windows, which is not installed on this machine, and fighting a toolchain while
writing contracts that hold money is the wrong trade.

Hardhat 3 closes most of the gap. It runs Solidity tests, compiles through a
Rust pipeline, and installs as a plain npm dependency. The tests are written
against `forge-std`, so they run under Foundry unchanged if this ever moves.

## Running

    npm install
    npm run build
    npm test

## Deploying

Testnet first. Always.

    DEPLOYER_KEY=0x... npm run deploy:testnet
    DEPLOYER_KEY=0x... npm run deploy:mainnet

`DEPLOYER_KEY` is read from the environment and never written to a file here.

## What the fuzzer already caught

The first run failed on the fourteenth input with an arithmetic underflow in
`sell`.

Every division in the curve was rounding down, which rounds in the trader's
favour. A buyer received fractionally more tokens than exact maths allows, and
selling those back computed a payout fractionally larger than what was paid in.
Repeated, that drains the curve; at the boundary it underflowed `ethReserve`
outright.

The fix was to round every division up, so rounding always favours the pool, and
to cap any payout at the ETH the curve has actually taken in. Rounding direction
in an AMM is not a detail, it is the safety property.

## Status

Not audited. The tests pass, including three fuzzed invariants at 256 runs each:

- a buy can never take more than the curve holds
- the contract always holds at least its reserves plus unpaid fees
- a sell never returns more than the same tokens just cost

That is a floor, not a clearance. These contracts should run on testnet 46630
with real transactions before they hold a stranger's money.
