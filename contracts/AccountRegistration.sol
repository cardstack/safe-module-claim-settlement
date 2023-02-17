// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AccountRegistration is ERC721Enumerable, Ownable {
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {}

    function register(
        address registrationAccount,
        address tokenRecipient
    ) external {
        require(
            registrationAccount == _msgSender(),
            "AccountRegistration: registration account must be the sender"
        );
        uint256 tokenId = uint256(uint160(_msgSender()));
        _mint(tokenRecipient, tokenId);
    }

    function unregister(uint256 tokenId) public virtual {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "ERC721: caller is not token owner or approved"
        );
        _burn(tokenId);
    }
}
