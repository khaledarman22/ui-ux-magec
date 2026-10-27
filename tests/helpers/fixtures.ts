import { generateTokens } from '@ui-ux-magec/design-engine';
import type { DesignSpecInput } from '@ui-ux-magec/schemas';

export const tokens = () => generateTokens({ primary: '#4F46E5', fontFamily: 'Inter', arabicFamily: 'Cairo' });

/** A small but realistic spec: a button component with two variants and a home screen (desktop LTR + mobile RTL). */
export function homeSpec(heroTitle = 'Grow your brand with data-driven creativity', assets: { image?: string; icon?: string } = {}): DesignSpecInput {
  const hero = (dir: 'en' | 'ar') => ({
    id: 'hero', name: 'Hero', layout: { direction: 'row' as const, gap: '$spacing.lg', padding: '$spacing.2xl', justify: 'start' as const, align: 'center' as const }, width: 'fill' as const,
    children: [
      {
        id: 'copy', name: 'Hero copy', layout: { direction: 'column' as const, gap: '$spacing.md' }, width: 'fill' as const,
        children: [
          { id: 'title', type: 'TEXT' as const, text: dir === 'en' ? heroTitle : 'نمِّ علامتك التجارية بإبداع قائم على البيانات', textStyle: '$typography.h1', color: '$color.text', align: 'start' as const },
          { id: 'cta', type: 'INSTANCE' as const, componentRef: 'button/variant=primary', overrides: { Label: dir === 'en' ? 'Book a call' : 'احجز مكالمة' } },
          ...(assets.icon ? [{ id: 'cta-icon', name: 'Icon / Arrow', icon: assets.icon, color: '$color.primary', width: 24, height: 24 }] : []),
        ],
      },
      assets.image
        ? { id: 'visual', name: 'Hero visual', width: 420, height: 320, radius: '$radius.lg', clip: true, image: assets.image }
        : { id: 'visual', name: 'Hero visual', type: 'RECTANGLE' as const, width: 420, height: 320, fill: '$color.primary-subtle', radius: '$radius.lg' },
    ],
  });
  return {
    specVersion: 1,
    components: [{
      id: 'button', name: 'Button',
      variants: ['primary', 'secondary'].map((v) => ({
        props: { variant: v },
        node: { id: 'root', layout: { direction: 'row' as const, padding: ['$spacing.sm', '$spacing.lg'] as [string, string], justify: 'center' as const, align: 'center' as const }, fill: v === 'primary' ? '$color.primary' : '$color.surface', radius: '$radius.md', children: [{ id: 'label', name: 'Label', type: 'TEXT' as const, text: 'Button', textStyle: '$typography.label', color: v === 'primary' ? '$color.on-primary' : '$color.text' }] },
      })),
    }],
    screens: [
      { id: 'home-desktop', name: 'Home — Desktop', page: 'Home', breakpoint: 'desktop', direction: 'ltr', sections: [hero('en')] },
      { id: 'home-mobile-ar', name: 'Home — Mobile (AR)', page: 'Home', breakpoint: 'mobile', direction: 'rtl', sections: [{ ...hero('ar'), layout: { direction: 'column' as const, gap: '$spacing.md', padding: '$spacing.lg' } }] },
    ],
  };
}
