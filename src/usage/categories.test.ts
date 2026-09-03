import { describe, expect, test } from 'bun:test';
import { siteId } from '/types/sitelist';
import { classifySurface, classifySurfaceDetails } from './categories';

describe('surface categories', () => {
	test('keeps Instagram messages and followed posts outside algorithmic time', () => {
		expect(classifySurface(siteId('instagram'), '/direct/inbox/')).toBe('messages');
		expect(classifySurface(siteId('instagram'), '/')).toBe('intentional');
		expect(classifySurface(siteId('instagram'), '/', { instagramSuggested: true })).toBe('algorithmic');
		expect(classifySurface(siteId('instagram'), '/reels/')).toBe('algorithmic');
	});

	test('distinguishes YouTube discovery from direct viewing', () => {
		expect(classifySurface(siteId('youtube'), '/')).toBe('algorithmic');
		expect(classifySurface(siteId('youtube'), '/shorts/abc')).toBe('algorithmic');
		expect(classifySurface(siteId('youtube'), '/watch')).toBe('intentional');
		expect(classifySurface(siteId('youtube'), '/watch', { provenance: 'algorithmic' })).toBe('algorithmic');
	});

	test('distinguishes X For You, Following, and messages', () => {
		expect(classifySurface(siteId('twitter'), '/home', { twitterTimeline: 'for-you' })).toBe('algorithmic');
		expect(classifySurface(siteId('twitter'), '/home', { twitterTimeline: 'following' })).toBe('intentional');
		expect(classifySurface(siteId('twitter'), '/messages/1')).toBe('messages');
	});

	test('returns stable privacy-preserving surface identifiers', () => {
		expect(classifySurfaceDetails(siteId('youtube'), '/shorts/abc').surfaceId).toBe('shorts');
		expect(classifySurfaceDetails(siteId('twitter'), '/home', { twitterTimeline: 'for-you' }).surfaceId).toBe('for_you');
		expect(classifySurfaceDetails(siteId('reddit'), '/r/typescript').surfaceId).toBe('community');
		expect(classifySurfaceDetails(siteId('instagram'), '/direct/inbox').surfaceId).toBe('messages');
	});
});
