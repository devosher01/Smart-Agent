// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC8004IdentityRegistry
 * @dev ERC-721 based Identity Registry for AI Agents (ERC8004)
 * Each AI agent gets a unique NFT that represents its identity
 */
contract ERC8004IdentityRegistry is ERC721, Ownable {
    uint256 private _tokenIds;
    
    // Agent metadata structure
    struct AgentIdentity {
        string name;
        string description;
        string agentCardURI; // URL to Agent Card JSON (IPFS or HTTP)
        string[] capabilities; // List of agent capabilities
        address agentAddress; // The address that controls this agent
        uint256 createdAt;
        bool active;
    }
    
    // Mapping from token ID to agent identity
    mapping(uint256 => AgentIdentity) public agentIdentities;
    
    // Mapping from agent address to token ID
    mapping(address => uint256) public agentToTokenId;
    
    // Mapping from token ID to agent address
    mapping(uint256 => address) public tokenIdToAgent;
    
    event AgentRegistered(
        uint256 indexed tokenId,
        address indexed agentAddress,
        string name,
        string agentCardURI
    );
    
    event AgentUpdated(
        uint256 indexed tokenId,
        address indexed agentAddress,
        string agentCardURI
    );
    
    event AgentDeactivated(uint256 indexed tokenId, address indexed agentAddress);
    
    constructor() ERC721("AI Agent Identity", "AGENT") Ownable(msg.sender) {}
    
    /**
     * @dev Register a new AI agent and mint its identity NFT
     * @param agentAddress The address that will control this agent
     * @param name Agent name
     * @param description Agent description
     * @param agentCardURI URI to the Agent Card JSON metadata
     * @param capabilities Array of capability strings
     * @return tokenId The minted token ID
     */
    function registerAgent(
        address agentAddress,
        string memory name,
        string memory description,
        string memory agentCardURI,
        string[] memory capabilities
    ) public onlyOwner returns (uint256) {
        require(agentToTokenId[agentAddress] == 0, "Agent already registered");
        
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        
        // Mint NFT to the agent address
        _mint(agentAddress, newTokenId);
        
        // Store agent identity
        agentIdentities[newTokenId] = AgentIdentity({
            name: name,
            description: description,
            agentCardURI: agentCardURI,
            capabilities: capabilities,
            agentAddress: agentAddress,
            createdAt: block.timestamp,
            active: true
        });
        
        // Update mappings
        agentToTokenId[agentAddress] = newTokenId;
        tokenIdToAgent[newTokenId] = agentAddress;
        
        emit AgentRegistered(newTokenId, agentAddress, name, agentCardURI);
        
        return newTokenId;
    }
    
    /**
     * @dev Update agent metadata (only by agent owner or contract owner)
     * @param tokenId The agent's token ID
     * @param agentCardURI New Agent Card URI
     * @param capabilities Updated capabilities array
     */
    function updateAgent(
        uint256 tokenId,
        string memory agentCardURI,
        string[] memory capabilities
    ) public {
        require(_ownerOf(tokenId) != address(0), "Agent does not exist");
        require(
            ownerOf(tokenId) == msg.sender || msg.sender == owner(),
            "Not authorized to update"
        );
        
        agentIdentities[tokenId].agentCardURI = agentCardURI;
        agentIdentities[tokenId].capabilities = capabilities;
        
        emit AgentUpdated(tokenId, agentIdentities[tokenId].agentAddress, agentCardURI);
    }
    
    /**
     * @dev Deactivate an agent (only by contract owner)
     * @param tokenId The agent's token ID
     */
    function deactivateAgent(uint256 tokenId) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Agent does not exist");
        agentIdentities[tokenId].active = false;
        emit AgentDeactivated(tokenId, agentIdentities[tokenId].agentAddress);
    }
    
    /**
     * @dev Get agent identity by token ID
     * @param tokenId The agent's token ID
     * @return Agent identity struct
     */
    function getAgentIdentity(uint256 tokenId) public view returns (AgentIdentity memory) {
        return agentIdentities[tokenId];
    }
    
    /**
     * @dev Get agent token ID by agent address
     * @param agentAddress The agent's address
     * @return tokenId The agent's token ID (0 if not registered)
     */
    function getAgentTokenId(address agentAddress) public view returns (uint256) {
        return agentToTokenId[agentAddress];
    }
    
    /**
     * @dev Check if an agent is registered and active
     * @param agentAddress The agent's address
     * @return isRegistered True if agent is registered
     * @return isActive True if agent is active
     * @return tokenId The agent's token ID
     */
    function isAgentRegistered(address agentAddress) 
        public 
        view 
        returns (bool isRegistered, bool isActive, uint256 tokenId) 
    {
        tokenId = agentToTokenId[agentAddress];
        isRegistered = tokenId != 0;
        if (isRegistered) {
            isActive = agentIdentities[tokenId].active;
        }
    }
}

