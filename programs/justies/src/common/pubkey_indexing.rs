use crate::common::{
  create_pda, is_account_initialized, resize_account, PubkeyIndexPage,
};
use anchor_lang::prelude::*;

/// Indexes a pubkey into the indexing page account for future iteration.
///
/// This is a generic page-based key indexing mechanism that could help indexing
/// a set of public keys to make them iterable. The reason to apply page-based
/// indexing rather than the index-based PDAs is that it has much better
/// tolerance to PDA conflicts for the high-concurrency use case (such as:
/// last minutes bidding).
///
/// The indexing process is fully dynamically as the Anchor's macro annotations
/// are not flexible enough to support the use case.
pub fn index_pubkey<'info>(
  key: Pubkey,
  index_page_bump: u8,
  signer_seed: &[&[u8]],
  index_page_info: AccountInfo<'info>,
  payer_info: AccountInfo<'info>,
  owner_program_info: AccountInfo<'info>,
  system_program_info: AccountInfo<'info>,
) -> Result<()> {
  let mut index_page: Account<'info, PubkeyIndexPage>;
  // Creates the indexing page if it is uninitialized.
  if !is_account_initialized(&index_page_info) {
    create_pda(
      payer_info.clone(),
      index_page_info.clone(),
      PubkeyIndexPage::space(1),
      signer_seed,
      owner_program_info.clone(),
      system_program_info.clone(),
    )?;
    index_page = Account::try_from_unchecked(&index_page_info)?;
  } else {
    // Otherwise loads the existing indexing page account.
    index_page = Account::try_from(&index_page_info)?;
  }

  if !index_page.initialized {
    // initialize the index page if it's new.
    // No resizing is needed as in this case the space has been allocated for
    // the 1st key.
    index_page.bump = index_page_bump;
    index_page.initialized = true;
  } else {
    // Resize the index page account for the new bid key record.
    resize_account(
      index_page_info.clone(),
      PubkeyIndexPage::space(index_page.keys.len() + 1),
      payer_info.clone(),
      system_program_info.clone(),
    )?;
  }
  // Adds the key into the index page.
  index_page.keys.push(key);
  // Need to call exit manually to persistent the account state.
  index_page.exit(owner_program_info.key)?;
  Ok(())
}
