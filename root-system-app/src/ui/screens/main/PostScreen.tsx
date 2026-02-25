// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — Post Screen
//
// Type cards → always-visible core fields → collapsible details.
// Safety runs inline before submit. Rate limit enforced client-side.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../theme/index';
import { getIdentity } from '../../../db/identity';
import { upsertPost, logPost, getPostCountSince } from '../../../db/posts';
import { pushPostToRelay } from '../../../sync/index';
import { sign, canonicalPost } from '../../../crypto/keypair';
import { detectScamWarnings, detectCrisis, detectMinor, detectFairHousing, CRISIS_RESOURCES } from '../../../safety/index';
import type { Post, PostType, CategoryId } from '../../../models/types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'skills',    label: 'Skills',    emoji: '🌿' },
  { id: 'goods',     label: 'Goods',     emoji: '📦' },
  { id: 'care',      label: 'Care',      emoji: '🤲' },
  { id: 'food',      label: 'Food',      emoji: '🌱' },
  { id: 'tech',      label: 'Tech',      emoji: '⚙️' },
  { id: 'housing',   label: 'Housing',   emoji: '🏡' },
  { id: 'transport', label: 'Transport', emoji: '🚲' },
  { id: 'knowledge', label: 'Knowledge', emoji: '📜' },
  { id: 'grief',     label: 'Grief',     emoji: '🕯️' },
  { id: 'labor',     label: 'Labor',     emoji: '✊' },
] as const;

const FREE_SUBTYPES = [
  'take it', 'curb alert', 'first come first served', 'random act',
] as const;

const ZONES = [
  'Any / Network-wide',
  'My neighborhood',
  'My block',
  'My building',
  'Nearby (5 mi)',
  'Nearby (25 mi)',
] as const;

const TEMPLATES: { label: string; type: PostType; category: CategoryId; title: string; body: string; tags: string[] }[] = [
  { label: 'Skill Share', type: 'offer', category: 'skills',   title: 'Teaching [skill]', body: 'I can help with [skill]. Available [when]. [Any other details.]', tags: ['skill-share'] },
  { label: 'Need Help',   type: 'need',  category: 'skills',   title: 'Looking for help with [thing]', body: 'I need help with [thing]. [Why/context.] [What you need from helper.]', tags: [] },
  { label: 'Free Stuff',  type: 'free',  category: 'goods',    title: 'Free [item]', body: '[Condition]. [Pickup details.] First come first served.', tags: ['free'] },
  { label: 'Food Share',  type: 'offer', category: 'food',     title: 'Extra [food] to share', body: 'Made extra [food]. [Quantity]. [Pickup window/location.]', tags: ['food-share'] },
  { label: 'Childcare',   type: 'offer', category: 'care',     title: 'Childcare available [day]', body: '[Ages/experience.] Available [when]. [Hourly or time bank.]', tags: ['childcare'] },
  { label: 'Ride Share',  type: 'offer', category: 'transport',title: 'Ride to [destination]', body: 'Heading to [destination] on [date/time]. Can fit [#] people. [Details.]', tags: ['ride'] },
];

const RATE_LIMIT_PER_DAY = 5;
const RATE_LIMIT_PER_10MIN = 2;

// ─── COMPONENT ──────────────────────────────────────────────────────────────

interface FormState {
  type: PostType;
  category: CategoryId;
  freeSubtype: string;
  zone: string;
  title: string;
  body: string;
  contactInfo: string;
  handle: string;
  bio: string;
  tags: string;
  timebankHours: string;
  recurring: boolean;
}

const DEFAULT_FORM: FormState = {
  type: 'offer',
  category: 'skills',
  freeSubtype: 'take it',
  zone: 'Any / Network-wide',
  title: '',
  body: '',
  contactInfo: '',
  handle: '',
  bio: '',
  tags: '',
  timebankHours: '',
  recurring: false,
};

export default function PostScreen() {
  const [form, setForm]             = useState<FormState>(DEFAULT_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);

  // Safety state
  const [scamWarnings, setScamWarnings]     = useState<{ id: string; msg: string }[]>([]);
  const [crisisFlag, setCrisisFlag]         = useState(false);
  const [minorFlag, setMinorFlag]           = useState(false);
  const [fairHousingFlag, setFairHousingFlag] = useState(false);

  // Rate limit state
  const [rateLimited, setRateLimited] = useState(false);

  // Identity
  const [identity, setIdentity] = useState<Awaited<ReturnType<typeof getIdentity>>>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getIdentity().then(setIdentity);
  }, []);

  // Pre-fill handle from identity if not set
  useEffect(() => {
    if (identity?.handle && !form.handle) {
      setForm(f => ({ ...f, handle: identity.handle ?? '' }));
    }
  }, [identity]);

  // ── Safety checks on title/body change ─────────────────────────────────

  useEffect(() => {
    const scam = detectScamWarnings(form.title, form.body);
    setScamWarnings(scam);
    setCrisisFlag(detectCrisis(form.title, form.body));
    setMinorFlag(detectMinor(`${form.title} ${form.body}`));
    setFairHousingFlag(detectFairHousing(form.title, form.body));
  }, [form.title, form.body]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const detailsFilledCount = [
    form.handle,
    form.bio,
    form.tags,
    form.category !== 'skills' ? '1' : '',
    form.zone !== 'Any / Network-wide' ? '1' : '',
    form.timebankHours,
    form.recurring ? '1' : '',
  ].filter(Boolean).length;

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setForm(f => ({
      ...f,
      type: t.type,
      category: t.category,
      title: t.title,
      body: t.body,
      tags: t.tags.join(', '),
    }));
    setDetailsOpen(true);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (submitting) return;
    if (!form.title.trim() || !form.body.trim()) {
      Alert.alert('Missing fields', 'Title and description are required.');
      return;
    }
    if (!identity) {
      Alert.alert('No identity', 'Something went wrong. Restart the app.');
      return;
    }

    // Rate limiting
    const now = new Date();
    const dayAgo   = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const dayCount   = await getPostCountSince(dayAgo);
    const recentCount = await getPostCountSince(tenMinAgo);

    if (dayCount >= RATE_LIMIT_PER_DAY) {
      setRateLimited(true);
      Alert.alert('Daily limit reached', `You can post ${RATE_LIMIT_PER_DAY} times per day. Come back tomorrow.`);
      return;
    }
    if (recentCount >= RATE_LIMIT_PER_10MIN) {
      setRateLimited(true);
      Alert.alert('Slow down', `Max ${RATE_LIMIT_PER_10MIN} posts per 10 minutes. Wait a bit.`);
      return;
    }
    setRateLimited(false);

    setSubmitting(true);
    try {
      const communityId = identity.communityIds[0] ?? 'local';
      const postId = uuidv4();
      const now8601 = new Date().toISOString();
      const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

      const parsedTags = form.tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

      const post: Post = {
        id: postId,
        communityId,
        type: form.type,
        freeSubtype: form.type === 'free' ? (form.freeSubtype as Post['freeSubtype']) : null,
        category: form.category,
        zone: form.zone,
        title: form.title.trim(),
        body: form.body.trim(),
        tags: parsedTags,
        recurring: form.recurring,
        authorPublicKey: identity.publicKey,
        handle: form.handle.trim() || identity.handle || 'Anonymous',
        bio: form.bio.trim() || null,
        contactInfoEncrypted: null, // set after handshake — TODO phase 6
        timebankHours: form.type !== 'free' && form.timebankHours ? parseFloat(form.timebankHours) : null,
        createdAt: now8601,
        expiresAt: expires,
        renewedAt: null,
        status: 'active',
        flags: 0,
        flaggedBy: [],
        _sig: '',
        _version: 1,
        _updatedAt: now8601,
        _tombstone: false,
      };

      // Sign
      const msg = canonicalPost(post);
      const sig = await sign(msg);
      post._sig = sig;

      await upsertPost(post);
      await logPost(postId);
      void pushPostToRelay(post);  // fire-and-forget: relay push is best-effort

      setSubmitted(true);
      setForm(DEFAULT_FORM);
      setDetailsOpen(false);
    } catch (err) {
      Alert.alert('Error', 'Could not save post. Try again.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.successBox}>
          <Text style={styles.successIcon}>✦</Text>
          <Text style={styles.successTitle}>Posted</Text>
          <Text style={styles.successBody}>
            Your post is live in the commons. It expires in 14 days — you can renew it from My Root.
          </Text>
          <Pressable style={styles.successBtn} onPress={() => setSubmitted(false)}>
            <Text style={styles.successBtnText}>Post another</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>New Post</Text>

        {/* ── TYPE CARDS ─────────────────────────────────────────────── */}
        <View style={styles.typeGrid}>
          {([
            { t: 'offer' as PostType, label: 'I have something', sub: 'skill, time, goods, knowledge' },
            { t: 'need'  as PostType, label: 'I need something',  sub: 'help, goods, skills, support' },
            { t: 'free'  as PostType, label: 'Giving this away',  sub: 'no exchange needed' },
          ]).map(({ t, label, sub }) => (
            <Pressable
              key={t}
              style={[styles.typeCard, styles[`typeCard_${t}`], form.type === t && styles[`typeCard_${t}_active`]]}
              onPress={() => set('type', t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: form.type === t }}
            >
              <Text style={[styles.typeCardLabel, form.type === t && styles[`typeCardLabel_${t}_active`]]}>
                {label}
              </Text>
              <Text style={styles.typeCardSub}>{sub}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── CORE FIELDS ────────────────────────────────────────────── */}
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={v => set('title', v)}
          placeholder="What are you offering, seeking, or giving away?"
          placeholderTextColor={Colors.dim}
          maxLength={120}
        />

        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.body}
          onChangeText={v => set('body', v)}
          placeholder="More detail — be specific. Location hints, timing, conditions."
          placeholderTextColor={Colors.dim}
          multiline
          numberOfLines={4}
          maxLength={1200}
          textAlignVertical="top"
        />

        {/* Minor warning — inline, non-blocking */}
        {minorFlag && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠ This post may involve a minor. Root System is for adults.
              If you're seeking help for a child, reach out to a trusted adult or call{' '}
              <Text style={styles.bold}>211</Text>.
            </Text>
          </View>
        )}

        {/* Fair housing warning */}
        {fairHousingFlag && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠ This post may contain language that violates fair housing law.
              Restrictions based on race, religion, family status, national origin, or disability
              are prohibited.
            </Text>
          </View>
        )}

        {/* Scam warnings */}
        {scamWarnings.map(w => (
          <View key={w.id} style={styles.warningBox}>
            <Text style={styles.warningText}>⚠ {w.msg}</Text>
          </View>
        ))}

        {/* Crisis detection */}
        {crisisFlag && (
          <View style={styles.crisisBox}>
            <Text style={styles.crisisTitle}>Are you okay?</Text>
            <Text style={styles.crisisBody}>
              We noticed your post might touch on something serious.
              You don't have to go through it alone.
            </Text>
            {CRISIS_RESOURCES.map(r => (
              <Text key={r.label} style={styles.crisisResource}>
                {r.label}: <Text style={styles.bold}>{r.value}</Text>
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.fieldLabel}>
          Contact info{' '}
          <Text style={styles.fieldHint}>(optional — only shared after you approve a request)</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={form.contactInfo}
          onChangeText={v => set('contactInfo', v)}
          placeholder="Email, Signal handle, etc."
          placeholderTextColor={Colors.dim}
          maxLength={200}
          autoCorrect={false}
        />
        <Text style={styles.fieldHint}>
          This is encrypted on your device and only revealed when you explicitly confirm an exchange.
        </Text>

        {/* ── DETAILS TOGGLE ─────────────────────────────────────────── */}
        <Pressable
          style={styles.detailsToggle}
          onPress={() => setDetailsOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
        >
          <Text style={styles.detailsToggleText}>
            {detailsOpen ? '− Less' : '+ Add details'}
          </Text>
          {!detailsOpen && detailsFilledCount > 0 && (
            <View style={styles.detailsBadge}>
              <Text style={styles.detailsBadgeText}>{detailsFilledCount} set</Text>
            </View>
          )}
        </Pressable>

        {/* ── COLLAPSIBLE DETAILS ─────────────────────────────────────── */}
        {detailsOpen && (
          <View style={styles.detailsBody}>

            {/* Templates */}
            <Text style={styles.fieldLabel}>Quick templates</Text>
            <View style={styles.chipRow}>
              {TEMPLATES.map(t => (
                <Pressable
                  key={t.label}
                  style={styles.chip}
                  onPress={() => applyTemplate(t)}
                >
                  <Text style={styles.chipText}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Free subtype */}
            {form.type === 'free' && (
              <>
                <Text style={styles.fieldLabel}>Free type</Text>
                <View style={styles.chipRow}>
                  {FREE_SUBTYPES.map(st => (
                    <Pressable
                      key={st}
                      style={[styles.chip, form.freeSubtype === st && styles.chipActive]}
                      onPress={() => set('freeSubtype', st)}
                    >
                      <Text style={[styles.chipText, form.freeSubtype === st && styles.chipTextActive]}>
                        {st}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c.id}
                  style={[styles.chip, form.category === c.id && styles.chipActive]}
                  onPress={() => set('category', c.id as CategoryId)}
                >
                  <Text style={[styles.chipText, form.category === c.id && styles.chipTextActive]}>
                    {c.emoji} {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Zone */}
            <Text style={styles.fieldLabel}>Zone</Text>
            <View style={styles.chipRow}>
              {ZONES.map(z => (
                <Pressable
                  key={z}
                  style={[styles.chip, form.zone === z && styles.chipActive]}
                  onPress={() => set('zone', z)}
                >
                  <Text style={[styles.chipText, form.zone === z && styles.chipTextActive]}>
                    {z}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Handle */}
            <Text style={styles.fieldLabel}>
              Your handle <Text style={styles.fieldHint}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={form.handle}
              onChangeText={v => set('handle', v)}
              placeholder="How should people address you?"
              placeholderTextColor={Colors.dim}
              maxLength={40}
              autoCorrect={false}
            />

            {/* Bio */}
            <Text style={styles.fieldLabel}>
              About you <Text style={styles.fieldHint}>(optional, max 280)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.bio}
              onChangeText={v => set('bio', v.slice(0, 280))}
              placeholder="Who you are in this community"
              placeholderTextColor={Colors.dim}
              multiline
              numberOfLines={3}
              maxLength={280}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{form.bio.length}/280</Text>

            {/* Time bank hours (not for free) */}
            {form.type !== 'free' && (
              <>
                <Text style={styles.fieldLabel}>
                  Time bank hours <Text style={styles.fieldHint}>(optional)</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={form.timebankHours}
                  onChangeText={v => set('timebankHours', v.replace(/[^0-9.]/g, ''))}
                  placeholder="e.g. 1.5"
                  placeholderTextColor={Colors.dim}
                  keyboardType="decimal-pad"
                  maxLength={5}
                />
                <Text style={styles.fieldHint}>
                  Time banking is skill-for-skill. 1 hour = 1 hour, regardless of what it is.
                </Text>
              </>
            )}

            {/* Tags */}
            <Text style={styles.fieldLabel}>
              Tags <Text style={styles.fieldHint}>(comma separated)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={form.tags}
              onChangeText={v => set('tags', v)}
              placeholder="e.g. carpentry, tools, weekend"
              placeholderTextColor={Colors.dim}
              maxLength={200}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {/* Recurring */}
            <Pressable
              style={styles.checkRow}
              onPress={() => set('recurring', !form.recurring)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.recurring }}
            >
              <View style={[styles.checkbox, form.recurring && styles.checkboxChecked]}>
                {form.recurring && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                This is recurring (available on an ongoing basis)
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── SUBMIT ──────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.submitBtn, (submitting || rateLimited) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || rateLimited}
          accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color={Colors.greenDeep} />
            : <Text style={[styles.submitBtnText, (submitting || rateLimited) && styles.submitBtnTextDisabled]}>
                Post to the Commons
              </Text>
          }
        </Pressable>

        <Text style={styles.footerHint}>
          Posts expire in 14 days. You can renew or withdraw at any time from My Root.
          Nothing is posted until you tap the button above.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  screenTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xl,
    color: Colors.cream,
    marginBottom: Spacing.lg,
  },

  // Type cards
  typeGrid: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    minHeight: 80,
  },
  typeCard_offer: { borderColor: Colors.border },
  typeCard_need:  { borderColor: Colors.border },
  typeCard_free:  { borderColor: Colors.border },
  typeCard_offer_active: { backgroundColor: 'rgba(61,107,46,0.2)',  borderColor: Colors.greenMid },
  typeCard_need_active:  { backgroundColor: 'rgba(138,37,53,0.2)',  borderColor: Colors.wine },
  typeCard_free_active:  { backgroundColor: 'rgba(196,152,46,0.12)', borderColor: Colors.gold },
  typeCardLabel: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.sm,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 18,
  },
  typeCardLabel_offer_active: { color: Colors.greenMid },
  typeCardLabel_need_active:  { color: Colors.wine },
  typeCardLabel_free_active:  { color: Colors.gold },
  typeCardSub: {
    fontFamily: Typography.bodyItalic,
    fontSize: 10,
    color: Colors.earth,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },

  // Fields
  fieldLabel: {
    fontFamily: Typography.bodySemi,
    fontSize: Typography.sm,
    color: Colors.cream,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  fieldHint: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    lineHeight: 18,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.cream,
    minHeight: 44,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 10,
  },
  charCount: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'right',
    marginTop: 2,
  },

  // Warnings
  warningBox: {
    backgroundColor: 'rgba(196,152,46,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.gold,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: 2,
  },
  warningText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.moonsilver,
    lineHeight: 18,
  },
  crisisBox: {
    backgroundColor: 'rgba(138,37,53,0.1)',
    borderWidth: 1,
    borderColor: Colors.wine,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.sm,
  },
  crisisTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.cream,
    marginBottom: 4,
  },
  crisisBody: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  crisisResource: {
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.moonsilver,
    lineHeight: 22,
  },
  bold: { fontFamily: Typography.bodySemi, color: Colors.cream },

  // Details toggle
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,152,46,0.1)',
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  detailsToggleText: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.sm,
    color: Colors.earth,
  },
  detailsBadge: {
    backgroundColor: 'rgba(196,152,46,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  detailsBadgeText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.gold,
  },
  detailsBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,152,46,0.08)',
    paddingTop: Spacing.sm,
  },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(196,152,46,0.12)',
  },
  chipText: {
    fontFamily: Typography.body,
    fontSize: Typography.xs,
    color: Colors.dim,
  },
  chipTextActive: { color: Colors.gold },

  // Recurring checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: 'rgba(196,152,46,0.15)',
    borderColor: Colors.gold,
  },
  checkmark: {
    color: Colors.gold,
    fontSize: 13,
    fontFamily: Typography.bodySemi,
  },
  checkLabel: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: Typography.sm,
    color: Colors.cream,
    lineHeight: 22,
  },

  // Submit
  submitBtn: {
    backgroundColor: Colors.gold,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(196,152,46,0.2)',
  },
  submitBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.greenDeep,
    letterSpacing: 0.5,
  },
  submitBtnTextDisabled: { color: Colors.dim },
  footerHint: {
    fontFamily: Typography.bodyItalic,
    fontSize: Typography.xs,
    color: Colors.dim,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },

  // Success
  successBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  successIcon: {
    fontFamily: Typography.serif,
    fontSize: 32,
    color: Colors.gold,
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.xxl,
    color: Colors.cream,
    marginBottom: Spacing.sm,
  },
  successBody: {
    fontFamily: Typography.body,
    fontSize: Typography.base,
    color: Colors.moonsilver,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
    maxWidth: 300,
  },
  successBtn: {
    borderWidth: 1,
    borderColor: Colors.gold,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  successBtnText: {
    fontFamily: Typography.serifBold,
    fontSize: Typography.md,
    color: Colors.gold,
  },
} as const);
