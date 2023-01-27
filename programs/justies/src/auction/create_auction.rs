use crate::admin::{GlobalStates, TokenAllowlistStates};
use crate::auction::state::Auction;
use crate::common::{
  get_current_timestamp, validate_share_configs, AuctionStrategy,
  JustiesErrorCode, GroupConfig, RevenueShareConfig,
};
use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::metadata::MetadataAccount;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Creates auction.
///
/// The creator needs to specify key parameters of the auction (duration, start
/// bid, revenue recipients, NFT token, currency token, eligible groups config,
/// etc). Once created, the NFT token will be transferred from the creator's NFT
/// account to the lot escrow NFT account (with the auction as the token
/// authority). Both of the NFT collection and currency token must have been
/// allow-listed.
///
/// Once confirmed, the auction status will be set to "InProgress".
///
/// For eligible groups config and revenue recipients config, check
/// "GroupConfig" and "RevenueShareConfig" for more details.
#[derive(Accounts)]
#[instruction(
    id: u64,
    duration: i64,
    start_bid: u64,
    eligible_groups: Vec<GroupConfig>,
    revenue_shares: Vec<RevenueShareConfig>,
)]
pub struct CreateAuction<'info> {
  #[account(
      init,
      payer = creator,
      space = 8 + Auction::MAX_DATA_SIZE,
      seeds = [b"auction", id.to_le_bytes().as_ref()],
      bump,
      constraint = global_states.auction_creation_enabled == true @JustiesErrorCode::AuctionCreationDisabled,
      constraint = global_states.total_auctions == id @JustiesErrorCode::InvalidAuctionId,
      constraint = revenue_shares.len() <= RevenueShareConfig::MAX_REVENUE_RECEIVERS @JustiesErrorCode::InvalidRevenueRecipientNumber,
  )]
  pub auction: Box<Account<'info, Auction>>,
  pub nft_mint: Box<Account<'info, Mint>>,
  pub currency_token_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  #[account(
      init,
      payer = creator,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"lot_escrow",
      ],
      bump,
      token::mint = nft_mint,
      token::authority = auction,
  )]
  pub lot_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      constraint = creator_nft_account.owner == creator.key() @JustiesErrorCode::InvalidAuctionCreatorNftAccount,
      constraint = creator_nft_account.mint == nft_mint.key() @JustiesErrorCode::InvalidAuctionCreatorNftAccount,
      constraint = creator_nft_account.amount > 0 @JustiesErrorCode::InvalidAuctionCreatorNftAccount,
  )]
  pub creator_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      seeds = [
        b"metadata",
        Metadata::id().as_ref(),
        nft_mint.key().as_ref(),
      ],
      seeds::program = Metadata::id(),
      bump,
      constraint = nft_metadata.mint == nft_mint.key() @JustiesErrorCode::InvalidNftMetadata,
      constraint = nft_metadata.collection != None @JustiesErrorCode::InvalidNftMetadata,
      constraint = nft_metadata.collection.as_ref().unwrap().verified == true @JustiesErrorCode::InvalidNftMetadata,
  )]
  pub nft_metadata: Box<Account<'info, MetadataAccount>>,
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(
      seeds = [
        b"nft_allowlist_states",
        nft_metadata.collection.as_ref().unwrap().key.as_ref(),
      ],
      bump = nft_allowlist_states.bump,
      constraint = nft_allowlist_states.token_mint_address == nft_metadata.collection.as_ref().unwrap().key @JustiesErrorCode::NftCollectionNotInAllowlist,
      constraint = nft_allowlist_states.allowed == true @JustiesErrorCode::NftCollectionNotInAllowlist,
  )]
  pub nft_allowlist_states: Account<'info, TokenAllowlistStates>,
  #[account(
      seeds = [b"token_allowlist_states", currency_token_mint.key().as_ref()],
      bump = token_allowlist_states.bump,
      constraint = token_allowlist_states.token_mint_address == currency_token_mint.key() @JustiesErrorCode::TokenNotInAllowlist,
      constraint = token_allowlist_states.allowed == true @JustiesErrorCode::TokenNotInAllowlist,
  )]
  pub token_allowlist_states: Account<'info, TokenAllowlistStates>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<CreateAuction>,
  id: u64,
  duration: i64,
  start_bid: u64,
  eligible_groups: Vec<GroupConfig>,
  revenue_shares: Vec<RevenueShareConfig>,
) -> Result<()> {
  let global_states = &mut ctx.accounts.global_states;
  let current_timestamp = get_current_timestamp(global_states);
  let creator = &ctx.accounts.creator;
  let auction_bump = *ctx.bumps.get("auction").unwrap();
  let nft_mint_address = ctx.accounts.nft_mint.key();
  let currency_token_mint_address = ctx.accounts.currency_token_mint.key();

  validate_share_configs(&revenue_shares)?;

  let mut auction_strategy = AuctionStrategy::new(
    &mut ctx.accounts.auction,
    &mut ctx.accounts.global_states,
  );
  auction_strategy.init_auction(
    id,
    auction_bump,
    nft_mint_address,
    currency_token_mint_address,
    creator.key(),
    duration,
    start_bid,
    &eligible_groups,
    &revenue_shares,
    current_timestamp,
  )?;
  auction_strategy.deposit_nft(
    &ctx.accounts.token_program,
    &ctx.accounts.creator_nft_account,
    &ctx.accounts.lot_escrow_nft_account,
    creator.to_account_info(),
  )?;
  Ok(())
}
