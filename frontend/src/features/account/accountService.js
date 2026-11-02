import { supabase } from '../auth/supabase.js';
import { serializeCartItems, normalizeCartItems } from '../cart/cartModel.js';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function loadMyProfile(userId) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadMyCart(userId) {
  const { data, error } = await client()
    .from('user_carts')
    .select('items')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeCartItems(data?.items);
}

export async function saveMyCart(userId, items) {
  const { data, error } = await client()
    .from('user_carts')
    .upsert({
      user_id: userId,
      items: serializeCartItems(items),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('user_id')
    .single();
  if (error) throw error;
  return data;
}

export async function loadMyOrders(userId) {
  const { data, error } = await client()
    .from('store_orders')
    .select('id, createdAt, status, items, total, customer')
    .eq('user_id', userId)
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function subscribeToMyOrders(userId, onChange, onUnavailable = () => {}) {
  const channel = client()
    .channel(`orders:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'store_orders',
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onUnavailable();
    });

  return () => {
    void client().removeChannel(channel);
  };
}

export async function saveMyProfile(userId, { username, displayName }) {
  const { data, error } = await client()
    .from('profiles')
    .update({ username, display_name: displayName })
    .eq('id', userId)
    .select('id, username, display_name')
    .single();
  if (error) throw error;

  // Keep Auth metadata in sync for OAuth providers and checkout fallbacks.
  const { error: metadataError } = await client().auth.updateUser({
    data: { full_name: displayName },
  });
  if (metadataError) throw metadataError;
  return data;
}

export async function saveMyUsername(userId, username) {
  const supabaseClient = client();
  const { data, error } = await supabaseClient
    .from('profiles')
    .update({ username })
    .eq('id', userId)
    .select('id, username, display_name')
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // A profile row is normally provisioned during OAuth signup. Create it if
  // the project does not have that trigger configured.
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError) throw userError;
  if (!user || user.id !== userId) throw new Error('Your session has expired. Please sign in again.');
  const displayName = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || username;
  const { data: inserted, error: insertError } = await supabaseClient
    .from('profiles')
    .insert({ id: userId, username, display_name: displayName })
    .select('id, username, display_name')
    .single();
  if (insertError) throw insertError;
  return inserted;
}

export async function loadMyWishlist(userId) {
  const { data, error } = await client()
    .from('wishlist_items')
    .select('product_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.product_id);
}

export async function addMyWishlistItem(productId) {
  const { data: { user }, error: userError } = await client().auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in to use your wishlist.');
  const { error } = await client().from('wishlist_items').upsert(
    { user_id: user.id, product_id: productId },
    { onConflict: 'user_id,product_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function removeMyWishlistItem(productId) {
  const { data: { user }, error: userError } = await client().auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in to use your wishlist.');
  const { error } = await client()
    .from('wishlist_items')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId);
  if (error) throw error;
}

