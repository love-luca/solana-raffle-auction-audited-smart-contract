use crate::admin::{GlobalStates, TokenAllowlistStates};
use crate::common::{index_pubkey, JustiesErrorCode, PubkeyIndexPage};
use crate::program::Justies;
use anchor_lang::prelude::*;
use anchor_spl::metadata::{Metadata, MetadataAccount};
use anchor_spl::token::Mint;

/// Adds an NFT collection to the allowlist so that its NFT tokens can be listed
/// in auctions and raffles.
///
/// The allowlist states can be looked up via collection mint address, or
/// iterated via the nft_allowlist_index pda.
///
/// Only callable by the authority.
#[derive(Accounts)]
#[instruction(collection_mint_address: Pubkey)]
pub struct AddNftCollectionToAllowList<'info> {
  #[account(
      init,
      payer = authority,
      space = 8 + TokenAllowlistStates::MAX_DATA_SIZE,
      seeds = [b"nft_allowlist_states", collection_mint_address.as_ref()],
      bump,
  )]
  pub nft_allowlist_states: Account<'info, TokenAllowlistStates>,
  /// CHECK: checked by the constraints.
  #[account(
      mut,
      seeds = [
        b"nft_allowlist_index",
        PubkeyIndexPage::page_id(
          global_states.total_allowed_nft_collections,
          global_states.num_keys_per_index_page,
        ).to_le_bytes().as_ref(),
      ],
      bump,
  )]
  pub nft_allowlist_index: UncheckedAccount<'info>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(
      mut,
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Account<'info, GlobalStates>,
  #[account(
      constraint = nft_collection_mint.key() == collection_mint_address.key() @JustiesErrorCode::InvalidNftCollectionMint,
      constraint = nft_collection_mint.decimals == 0 @JustiesErrorCode::InvalidNftCollectionMint,
      constraint = nft_collection_mint.supply == 1 @JustiesErrorCode::InvalidNftCollectionMint,
  )]
  pub nft_collection_mint: Account<'info, Mint>,
  #[account(
      seeds = [
        b"metadata",
        Metadata::id().as_ref(),
        nft_collection_mint.key().as_ref(),
      ],
      seeds::program = Metadata::id(),
      bump,
      constraint = collection_metadata.key == mpl_token_metadata::state::Key::MetadataV1 @JustiesErrorCode::InvalidNftCollectionMetadata,
      constraint = collection_metadata.collection == None @JustiesErrorCode::InvalidNftCollectionMetadata,
  )]
  pub collection_metadata: Account<'info, MetadataAccount>,
  pub justies_program: Program<'info, Justies>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<AddNftCollectionToAllowList>,
  collection_mint_address: Pubkey,
) -> Result<()> {
  let global_states = &mut ctx.accounts.global_states;
  let nft_allowlist_states = &mut ctx.accounts.nft_allowlist_states;

  nft_allowlist_states.bump = *ctx.bumps.get("nft_allowlist_states").unwrap();
  nft_allowlist_states.allowed = true;
  nft_allowlist_states.token_mint_address = collection_mint_address;

  // Indexes the nft allowlist states key to make it iterable.
  let page_id = PubkeyIndexPage::page_id(
    global_states.total_allowed_nft_collections,
    global_states.num_keys_per_index_page,
  );
  let page_id_bytes = page_id.to_le_bytes();
  let index_page_bump = *ctx.bumps.get("nft_allowlist_index").unwrap();
  let index_page_bump_bytes = index_page_bump.to_le_bytes();
  let signer_seed = vec![
    b"nft_allowlist_index".as_ref(),
    page_id_bytes.as_ref(),
    index_page_bump_bytes.as_ref(),
  ];
  index_pubkey(
    ctx.accounts.nft_allowlist_states.to_account_info().key(),
    index_page_bump,
    signer_seed.as_slice(),
    ctx.accounts.nft_allowlist_index.to_account_info(),
    ctx.accounts.authority.to_account_info(),
    ctx.accounts.justies_program.to_account_info(),
    ctx.accounts.system_program.to_account_info(),
  )?;

  global_states.total_allowed_nft_collections += 1;
  Ok(())
}
