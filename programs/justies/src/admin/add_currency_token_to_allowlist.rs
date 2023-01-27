use crate::admin::{GlobalStates, TokenAllowlistStates};
use crate::common::{index_pubkey, JustiesErrorCode, PubkeyIndexPage};
use crate::program::Justies;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Adds an currency token to the allowlist so that it can be used as accepted
/// currencies for making bid and buying raffle tickets.
///
/// The allowlist states can be looked up via token mint address, or iterated
/// via the token_allowlist_index pda.
///
/// Only callable by the authority.
#[derive(Accounts)]
#[instruction(token_mint_address: Pubkey)]
pub struct AddCurrencyTokenToAllowList<'info> {
  #[account(
      init,
      payer = authority,
      space = 8 + TokenAllowlistStates::MAX_DATA_SIZE,
      seeds = [b"token_allowlist_states", token_mint_address.as_ref()],
      bump,
  )]
  pub token_allowlist_states: Account<'info, TokenAllowlistStates>,
  /// CHECK: checked by the constraints.
  #[account(
      mut,
      seeds = [
        b"token_allowlist_index",
        PubkeyIndexPage::page_id(
          global_states.total_allowed_currency_tokens,
          global_states.num_keys_per_index_page,
        ).to_le_bytes().as_ref(),
      ],
      bump,
  )]
  pub token_allowlist_index: UncheckedAccount<'info>,
  #[account(
      init_if_needed,
      payer = authority,
      associated_token::mint = currency_token_mint,
      associated_token::authority = fee_treasury,
  )]
  pub fee_treasury_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub authority: Signer<'info>,
  /// CHECK: the address is verified in the constraint.
  pub fee_treasury: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
      constraint = global_states.fee_treasury_address == fee_treasury.key() @JustiesErrorCode::InvalidFeeTreasuryAddress,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(
      constraint = currency_token_mint.key() == token_mint_address.key() @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub currency_token_mint: Account<'info, Mint>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub justies_program: Program<'info, Justies>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<AddCurrencyTokenToAllowList>,
  token_mint_address: Pubkey,
) -> Result<()> {
  let global_states = &mut ctx.accounts.global_states;
  let token_allowlist_states = &mut ctx.accounts.token_allowlist_states;

  token_allowlist_states.bump =
    *ctx.bumps.get("token_allowlist_states").unwrap();
  token_allowlist_states.allowed = true;
  token_allowlist_states.token_mint_address = token_mint_address;

  // Indexes the token allowlist states key to make it iterable.
  let page_id = PubkeyIndexPage::page_id(
    global_states.total_allowed_currency_tokens,
    global_states.num_keys_per_index_page,
  );
  let page_id_bytes = page_id.to_le_bytes();
  let index_page_bump = *ctx.bumps.get("token_allowlist_index").unwrap();
  let index_page_bump_bytes = index_page_bump.to_le_bytes();
  let signer_seed = vec![
    b"token_allowlist_index".as_ref(),
    page_id_bytes.as_ref(),
    index_page_bump_bytes.as_ref(),
  ];
  index_pubkey(
    ctx.accounts.token_allowlist_states.to_account_info().key(),
    index_page_bump,
    signer_seed.as_slice(),
    ctx.accounts.token_allowlist_index.to_account_info(),
    ctx.accounts.authority.to_account_info(),
    ctx.accounts.justies_program.to_account_info(),
    ctx.accounts.system_program.to_account_info(),
  )?;

  global_states.total_allowed_currency_tokens += 1;
  Ok(())
}
