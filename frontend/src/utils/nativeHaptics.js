import { isClientApp } from './clientApp';

async function getHaptics() {
  if (!isClientApp()) return null;
  try {
    return await import('@capacitor/haptics');
  } catch {
    return null;
  }
}

export async function hapticImpact(style = 'Light') {
  const mod = await getHaptics();
  if (!mod?.Haptics) return;

  const impactStyle = mod.ImpactStyle?.[style] || mod.ImpactStyle?.Light || style;
  await mod.Haptics.impact({ style: impactStyle }).catch(() => {});
}

export async function hapticNotification(type = 'Success') {
  const mod = await getHaptics();
  if (!mod?.Haptics) return;

  const notificationType = mod.NotificationType?.[type] || mod.NotificationType?.Success || type;
  await mod.Haptics.notification({ type: notificationType }).catch(() => {});
}

export async function hapticSelection() {
  const mod = await getHaptics();
  if (!mod?.Haptics) return;

  await mod.Haptics.selectionChanged().catch(() => {});
}
