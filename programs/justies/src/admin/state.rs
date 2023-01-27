use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct TokenAllowlistStates {
  pub bump: u8,
  pub token_mint_address: Pubkey,
  pub allowed: bool,
}

impl TokenAllowlistStates {
  pub const MAX_DATA_SIZE: usize = 1 + 32 + 1;
}

/// The account type for storing the global configs & states.
#[account]
#[derive(Default)]
pub struct GlobalStates {
  pub bump: u8,
  /// The current Justies market fee rate.
  pub market_fee_rate_bps: u16,
  /// The fee treasury.
  pub fee_treasury_address: Pubkey,
  /// The authority to call admin instructions.
  pub authority: Pubkey,
  /// The minimum outbid rate.
  pub min_outbid_rate_bps: u16,
  /// The final time window (in minutes) during when new bids trigger auction
  /// extension.
  pub last_minutes_for_auction_extend: u8,
  /// The extended time in minutes.
  pub auction_extend_minutes: u8,
  /// The minimum allowed auction duration.
  pub min_auction_duration: u64,
  /// The maximum allowed auction duration.
  pub max_auction_duration: u64,
  /// The minimum allowed raffle ticket supply.
  pub min_raffle_ticket_supply: u16,
  /// The maximum allowed raffle ticket supply.
  pub max_raffle_ticket_supply: u16,
  /// The maximum number of raffled NFTs.
  pub max_raffled_nfts: u8,
  /// The minimum raffle duration.
  pub min_raffle_duration: u64,
  /// The maximum raffle duration.
  pub max_raffle_duration: u64,
  /// Whether auction creation is enabled.
  pub auction_creation_enabled: bool,
  /// Whether raffle creation is enabled.
  pub raffle_creation_enabled: bool,
  /// Total number of auctions ever created.
  pub total_auctions: u64,
  /// Total number of raffles ever created.
  pub total_raffles: u64,
  /// Total number of NFT collections ever allowed.
  pub total_allowed_nft_collections: u64,
  /// Total number of currency tokens ever allowed.
  pub total_allowed_currency_tokens: u64,
  /// Number of keys stored in each index page.
  pub num_keys_per_index_page: u16,
  // This is a special flag to support test-specific features such as: system
  // clock mocking.
  // !!!!!!!!!!!! This should never be true in the main network !!!!!!!!!
  pub is_test_environment: bool,
  // This can be set in the test only when "is_test_environment" is true.
  pub mock_timestamp: Option<i64>,
}

impl GlobalStates {
  pub const MAX_DATA_SIZE: usize = 1
    + 2
    + 32
    + 32
    + 2
    + 1
    + 1
    + 8
    + 8
    + 2
    + 2
    + 1
    + 8
    + 8
    + 1
    + 1
    + 8
    + 8
    + 8
    + 8
    + 2
    + 1
    + (1 + 8);
}
