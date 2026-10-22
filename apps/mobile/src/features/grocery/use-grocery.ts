import type { Database } from '@whattocook/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

type GroceryRow = Database['public']['Tables']['grocery_items']['Row'];

export interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  checked: boolean;
}

function mapRow(row: GroceryRow): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    checked: row.checked,
  };
}

export async function fetchGrocery(userId: string): Promise<GroceryItem[]> {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('user_id', userId)
    .order('checked', { ascending: true })
    .order('category', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as GroceryRow[]).map(mapRow);
}

export async function addGroceryItem(
  userId: string,
  input: { name: string; quantity?: string },
): Promise<void> {
  const name = input.name.trim();
  if (!name) return;
  const { error } = await supabase.from('grocery_items').insert({
    user_id: userId,
    name,
    quantity: input.quantity?.trim() || '1',
    category: 'Other',
  } as never);
  if (error) throw new Error(error.message);
}

export async function addGroceryItems(
  userId: string,
  items: Array<{ name: string; quantity?: string }>,
): Promise<void> {
  const rows = items
    .map((item) => ({
      user_id: userId,
      name: item.name.trim(),
      quantity: item.quantity?.trim() || '1',
      category: 'Recipe',
    }))
    .filter((row) => row.name.length > 0);
  if (rows.length === 0) return;

  const { error } = await supabase.from('grocery_items').insert(rows as never);
  if (error) throw new Error(error.message);
}

export async function toggleGroceryItem(id: string, checked: boolean): Promise<void> {
  const { error } = await supabase.from('grocery_items').update({ checked } as never).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGroceryItem(id: string): Promise<void> {
  const { error } = await supabase.from('grocery_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function clearCheckedGrocery(userId: string): Promise<void> {
  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('user_id', userId)
    .eq('checked', true);
  if (error) throw new Error(error.message);
}

export function useGrocery(userId: string | undefined) {
  return useQuery({
    queryKey: ['grocery', userId],
    queryFn: () => fetchGrocery(userId as string),
    enabled: Boolean(userId),
  });
}

function useInvalidateGrocery() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['grocery'] });
}

export function useAddGroceryItem(userId: string | undefined) {
  const invalidate = useInvalidateGrocery();
  return useMutation({
    mutationFn: (input: { name: string; quantity?: string }) =>
      addGroceryItem(userId as string, input),
    onSuccess: invalidate,
  });
}

export function useAddGroceryItems(userId: string | undefined) {
  const invalidate = useInvalidateGrocery();
  return useMutation({
    mutationFn: (items: Array<{ name: string; quantity?: string }>) =>
      addGroceryItems(userId as string, items),
    onSuccess: invalidate,
  });
}

export function useToggleGroceryItem() {
  const invalidate = useInvalidateGrocery();
  return useMutation({
    mutationFn: (input: { id: string; checked: boolean }) =>
      toggleGroceryItem(input.id, input.checked),
    onSuccess: invalidate,
  });
}

export function useDeleteGroceryItem() {
  const invalidate = useInvalidateGrocery();
  return useMutation({
    mutationFn: (id: string) => deleteGroceryItem(id),
    onSuccess: invalidate,
  });
}

export function useClearCheckedGrocery(userId: string | undefined) {
  const invalidate = useInvalidateGrocery();
  return useMutation({
    mutationFn: () => clearCheckedGrocery(userId as string),
    onSuccess: invalidate,
  });
}
