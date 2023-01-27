use crate::admin::{GlobalStates, TokenAllowlistStates};
use crate::common::{
  validate_share_configs, JustiesErrorCode, GroupConfig, RaffleStrategy,
  RevenueShareConfig,
};
use crate::get_current_timestamp;
use crate::raffle::{Raffle, TicketPositionStats};
use anchor_lang::prelude::*;
use anchor_spl::metadata::Metadata;
use anchor_spl::metadata::MetadataAccount;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Creates new raffle.
///
/// The creator needs to specify key parameters of the raffle (duration, ticket
/// supply, ticket price, number of raffled nfts, revenue recipients, NFT token,
/// currency token, eligible groups config, etc). Once created, the NFT tokens
/// will be transferred from the creator's NFT account to the rewards escrow
/// NFT account (with the raffle as the token authority). Both of the NFT
/// collection and currency token must have been allow-listed.
#[derive(Accounts)]
#[instruction(
    id: u64,
    duration: i64,
    ticket_supply: u16,
    ticket_price: u64,
    num_raffled_nfts: u8,
    eligible_groups: Vec<GroupConfig>,
    revenue_shares: Vec<RevenueShareConfig>,
)]
pub struct CreateRaffle<'info> {
  #[account(
      init,
      payer = creator,
      space = 8 + Raffle::MAX_DATA_SIZE,
      seeds = [b"raffle", id.to_le_bytes().as_ref()],
      bump,
      constraint = global_states.raffle_creation_enabled == true @JustiesErrorCode::RaffleCreationDisabled,
      constraint = global_states.total_raffles == id @JustiesErrorCode::InvalidRaffleId,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      init,
      payer = creator,
      space = 8 + TicketPositionStats::INIT_DATA_SIZE,
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position_stats",
      ],
      bump,
  )]
  pub ticket_position_stats: Box<Account<'info, TicketPositionStats>>,
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  #[account(
      constraint = nft_mint.decimals == 0 @JustiesErrorCode::InvalidNftMint,
      constraint = nft_mint.supply >= (num_raffled_nfts as u64) @JustiesErrorCode::InvalidNftMint,
  )]
  pub nft_mint: Box<Account<'info, Mint>>,
  pub currency_token_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  #[account(
      mut,
      constraint = creator_nft_account.owner == creator.key() @JustiesErrorCode::InvalidRaffleCreatorNftAccount,
      constraint = creator_nft_account.mint == nft_mint.key() @JustiesErrorCode::InvalidRaffleCreatorNftAccount,
      constraint = creator_nft_account.amount >= (num_raffled_nfts as u64) @JustiesErrorCode::InvalidRaffleCreatorNftAccount,
  )]
  pub creator_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init,
      payer = creator,
      seeds = [b"raffle", raffle.key().as_ref(), b"rewards_escrow"],
      bump,
      token::mint = nft_mint,
      token::authority = raffle,
  )]
  pub rewards_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init,
      payer = creator,
      seeds = [b"raffle", raffle.key().as_ref(), b"revenue_escrow"],
      bump,
      token::mint = currency_token_mint,
      token::authority = raffle,
  )]
  pub revenue_escrow_token_account: Box<Account<'info, TokenAccount>>,
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
      seeds = [
        b"nft_allowlist_states",
        nft_metadata.collection.as_ref().unwrap().key.as_ref(),
      ],
      bump = nft_allowlist_states.bump,
      constraint = nft_allowlist_states.token_mint_address == nft_metadata.collection.as_ref().unwrap().key @JustiesErrorCode::NftCollectionNotInAllowlist,
      constraint = nft_allowlist_states.allowed == true @JustiesErrorCode::NftCollectionNotInAllowlist,
  )]
  pub nft_allowlist_states: Box<Account<'info, TokenAllowlistStates>>,
  #[account(
      seeds = [b"token_allowlist_states", currency_token_mint.key().as_ref()],
      bump = token_allowlist_states.bump,
      constraint = token_allowlist_states.token_mint_address == currency_token_mint.key() @JustiesErrorCode::TokenNotInAllowlist,
      constraint = token_allowlist_states.allowed == true @JustiesErrorCode::TokenNotInAllowlist,
  )]
  pub token_allowlist_states: Box<Account<'info, TokenAllowlistStates>>,

  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<CreateRaffle>,
  id: u64,
  duration: i64,
  ticket_supply: u16,
  ticket_price: u64,
  num_raffled_nfts: u8,
  eligible_groups: Vec<GroupConfig>,
  revenue_shares: Vec<RevenueShareConfig>,
) -> Result<()> {
  let current_timestamp = get_current_timestamp(&ctx.accounts.global_states);
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  ctx.accounts.ticket_position_stats.bump =
    *ctx.bumps.get("ticket_position_stats").unwrap();
  validate_share_configs(&revenue_shares)?;
  raffle_strategy.init_raffle(
    id,
    ctx.bumps["raffle"],
    ctx.accounts.creator.to_account_info(),
    ctx.accounts.nft_mint.to_account_info(),
    num_raffled_nfts,
    ctx.accounts.currency_token_mint.to_account_info(),
    duration,
    ticket_supply,
    ticket_price,
    &eligible_groups,
    &revenue_shares,
    current_timestamp,
  )?;
  raffle_strategy.deposit_nft(
    &ctx.accounts.token_program,
    &ctx.accounts.creator_nft_account,
    &ctx.accounts.rewards_escrow_nft_account,
    ctx.accounts.creator.to_account_info(),
  )?;
  Ok(())
}
