use anchor_lang::prelude::*;
use bit_set::BitSet;
use itertools::Itertools;
use rand::prelude::*;
use wyhash::WyRng;

/// Gets random seed for on-chain RNG.
pub fn get_random_seed(current_timestamp: i64) -> [u8; 8] {
  let clock = Clock::get().unwrap();
  // Uses recent slot and current timestamp combined.
  return (clock.slot + current_timestamp as u64).to_le_bytes();
}

/// Implements the alias method for weighted sampling.
///
/// The algorithm takes O(N) time and space for initialization, and O(1) for
/// sampling with the probability proportional the the provided weights (e.g.:
/// number of raffle tickets for each raffle participant).
///
/// Details: https://lips.cs.princeton.edu/the-alias-method-efficient-sampling-with-many-discrete-outcomes/
pub fn create_alias_table(
  weights: &Vec<u16>,
  total_weight: i16,
) -> (Vec<i16>, Vec<u16>) {
  let n = weights.len();
  let mut prob: Vec<i16> = vec![0; n];
  let mut alias: Vec<u16> = vec![0; n];
  let mut small: Vec<u16> = Vec::with_capacity(n);
  let mut large: Vec<u16> = Vec::with_capacity(n);

  for (i, &weight) in weights.iter().enumerate() {
    prob[i] = (n as i16) * (weight as i16);
    if prob[i] < total_weight {
      small.push(i as u16);
    } else {
      large.push(i as u16);
    }
  }

  while small.len() > 0 && large.len() > 0 {
    let l = small.pop().unwrap() as usize;
    let g = large.pop().unwrap() as usize;
    alias[l] = g as u16;
    prob[g] = prob[g] - (total_weight - prob[l]);
    if prob[g] < total_weight {
      small.push(g as u16);
    } else {
      large.push(g as u16);
    }
  }

  while large.len() > 0 {
    prob[large.pop().unwrap() as usize] = total_weight;
  }

  while small.len() > 0 {
    prob[small.pop().unwrap() as usize] = total_weight;
  }

  (prob, alias)
}

/// Samples with alias method. The sampling takes O(1) time.
pub fn sample(
  prob: &Vec<i16>,
  alias: &Vec<u16>,
  total_weight: i16,
  rng: &mut WyRng,
) -> u16 {
  let i = rng.gen_range(0..prob.len());
  let p = rng.gen_range(0..(total_weight as i32)) as i16;
  return if p < prob[i] { i as u16 } else { alias[i] };
}

/// Picks winners based with probabilities proportional to the weights.
pub fn pick_winners(
  weights: &Vec<u16>,
  total_weight: u16,
  max_num_winners: u8,
  current_timestamp: i64,
) -> Vec<u16> {
  // WyRand RNG is super lightweight with decent random number quality.
  let mut rng = WyRng::from_seed(get_random_seed(current_timestamp));
  let (prob, alias) = create_alias_table(weights, total_weight as i16);
  // Use bitset to improve efficiency.
  let mut winner_set = BitSet::new();
  while winner_set.len() != max_num_winners.into() {
    winner_set
      .insert(sample(&prob, &alias, total_weight as i16, &mut rng) as usize);
  }
  winner_set.iter().map(|idx| idx as u16).collect_vec()
}
