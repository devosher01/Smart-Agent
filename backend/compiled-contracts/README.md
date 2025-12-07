# Compiled Contracts Directory

Place your Remix-compiled contract artifacts here.

## Format

Each contract should be saved as a JSON file with this structure:

```json
{
  "abi": [...],
  "bytecode": "0x..."
}
```

## Files Needed

1. `ERC8004IdentityRegistry.json`
2. `ERC8004ReputationRegistry.json`
3. `ERC8004ValidationRegistry.json`

## How to Compile in Remix

1. Go to https://remix.ethereum.org
2. Create a new workspace
3. In File Explorer, click "Dependencies" > "Add Package"
4. Enter: `@openzeppelin/contracts`
5. Upload your contracts from `contracts/` folder
6. Compile each contract
7. In the compilation artifacts, copy:
   - The ABI (from the JSON)
   - The bytecode (from evm.bytecode.object)
8. Save as JSON files in this directory

## Alternative: Use Hardhat

If you prefer Hardhat, compile with:
```bash
npx hardhat compile
```

Then copy the artifacts from `artifacts/contracts/` to this directory.

