use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

// This is a generic account states for indexing & iterating public keys.
// This is super useful for the use case of iteration PDAs by total number and
// indexes. The benefit of the indexing page is to not introduce too many PDA
// conflicts during traffic peak.
#[account]
#[derive(Default)]
pub struct PubkeyIndexPage {
  pub bump: u8,
  pub initialized: bool,
  pub keys: Vec<Pubkey>,
}

impl PubkeyIndexPage {
  pub const KEYS_PER_PAGE: usize = 100;
  pub const INIT_DATA_SIZE: usize = 1 + 1 + 4;
  pub fn space(len: usize) -> usize {
    8 + Self::INIT_DATA_SIZE + len * 32
  }
  pub fn page_id(total_keys: u64, page_size: u16) -> u64 {
    (total_keys / (page_size as u64)) as u64
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum ListingStatus {
  #[default]
  InProgress,
  Finished,
  Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct RevenueShareConfig {
  pub revenue_receiver: Pubkey,
  pub share_bps: u16,
}

impl RevenueShareConfig {
  pub const MAX_DATA_SIZE: usize = 32 + 2;
  pub const MAX_REVENUE_RECEIVERS: usize = 6;
}

#[derive(Clone)]
pub struct RevenueDistribution<'info> {
  pub revenue_receiver_token_account: Account<'info, TokenAccount>,
  pub share_bps: u16,
}

pub trait ShareConfig {
  fn share_bps(&self) -> u16;
}

impl ShareConfig for RevenueShareConfig {
  fn share_bps(&self) -> u16 {
    self.share_bps
  }
}

impl<'info> ShareConfig for RevenueDistribution<'info> {
  fn share_bps(&self) -> u16 {
    self.share_bps
  }
}

#[derive(
  AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default,
)]
pub enum GroupType {
  #[default]
  // The group of holders of a specific NFT collection;
  NftHolderGroup,
  // The group of holders of a specific SPL tokens;
  TokenHolderGroup,
  // The group of NFT holders based on off-chain criteria (e.g.: traits);
  // This typically rely on off-chain signature & on-chain verification.
  // (place-holder for v2).
  OffChainNftGroup,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct GroupConfig {
  // The type of the group;
  pub group_type: GroupType,
  // The public key associated with the group:
  // - NftHolderGroup: the mint address of the NFT collection;
  // - TokenHolderGroup: the mint address of the token;
  // - OffChainNftGroup: the account address to the off-chain group config (
  //  TBD in v2);
  pub key: Pubkey,
}

impl GroupConfig {
  pub const MAX_DATA_SIZE: usize = 4 + 32;
  pub const MAX_GROUP_CONFIGS: usize = 10;
}

// The input data required for eligibility check.
// The input and associated remaining_accounts payload will be matched against
// the specified eligible_groups configs of the auction/raffle.
#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, PartialEq)]
pub struct EligibilityCheckInput {
  // Each group type corresponds to different remaining_accounts payloads:
  // - NftHolderGroup:
  //   * remaining_accounts[0]: the token account;
  //   * remaining_accounts[1]: the token metadata account;
  // - TokenHolderGroup:
  //   * remaining_accounts[0]: the token account;
  // - OffChainNftGroup:
  //   * remaining_accounts[0]: the group config account;
  //   * remaining_accounts[1]: the token account;
  pub group_type: GroupType,
  // These fields are only needed when group_type is OffChainNftGroup.
  pub message: Option<Vec<u8>>,
  pub ed25519_signature: Option<Vec<u8>>,
}
