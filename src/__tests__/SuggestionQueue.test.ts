
import { describe, it, expect, beforeEach } from 'vitest';
import { SuggestionQueue } from '../services/SuggestionQueue';
import type { Prediction } from '../types/index';

describe('SuggestionQueue', () => {
  let queue: SuggestionQueue;
  
  // 创建 Mock 数据
  const createPrediction = (id: string, line: number): Prediction => ({
    targetLine: line,
    originalLineContent: '',
    suggestionText: `code-${id}`,
    explanation: `exp-${id}`,
    changeType: 'REPLACE_LINE'
  });

  const mockPredictions: Prediction[] = [
    createPrediction('1', 1),
    createPrediction('2', 2),
    createPrediction('3', 3)
  ];

  beforeEach(() => {
    queue = new SuggestionQueue();
  });

  describe('enqueue', () => {
    it('should add predictions and reset cursor', () => {
      queue.enqueue(mockPredictions);
      expect(queue.size()).toBe(3);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.peek()).toEqual(mockPredictions[0]);
    });

    it('should overwrite existing queue', () => {
      queue.enqueue([mockPredictions[0]]);
      expect(queue.size()).toBe(1);
      
      queue.enqueue(mockPredictions);
      expect(queue.size()).toBe(3);
    });
  });

  describe('navigation', () => {
    it('should peek current item', () => {
      queue.enqueue(mockPredictions);
      expect(queue.peek()).toEqual(mockPredictions[0]);
    });

    it('should return null when empty', () => {
      expect(queue.peek()).toBeNull();
    });

    it('should navigate next', () => {
      queue.enqueue(mockPredictions);
      
      const next1 = queue.next();
      expect(next1).toEqual(mockPredictions[1]);
      expect(queue.getCurrentIndex()).toBe(1);
      expect(queue.hasMore()).toBe(true);

      const next2 = queue.next();
      expect(next2).toEqual(mockPredictions[2]);
      expect(queue.getCurrentIndex()).toBe(2);
      expect(queue.hasMore()).toBe(false);
    });

    it('should not navigate past end', () => {
      queue.enqueue([mockPredictions[0]]);
      const next = queue.next();
      expect(next).toBeNull();
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('should navigate previous', () => {
      queue.enqueue(mockPredictions);
      queue.next(); // to index 1
      
      const prev = queue.previous();
      expect(prev).toEqual(mockPredictions[0]);
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('should not navigate past beginning', () => {
      queue.enqueue(mockPredictions);
      const prev = queue.previous();
      expect(prev).toBeNull();
      expect(queue.getCurrentIndex()).toBe(0);
    });
  });

  describe('dequeue', () => {
    it('should remove current item and shift remaining', () => {
      queue.enqueue([...mockPredictions]); // clone
      
      // Initial: [1, 2, 3], current: 0 (item 1)
      const removed = queue.dequeue();
      
      expect(removed).toEqual(mockPredictions[0]);
      expect(queue.size()).toBe(2);
      // Now: [2, 3], current: 0 (item 2)
      expect(queue.peek()).toEqual(mockPredictions[1]);
      expect(queue.getCurrentIndex()).toBe(0);
    });

    it('should adjust index when removing last item', () => {
      queue.enqueue([...mockPredictions]);
      
      // Move to last item: index 2 (item 3)
      queue.next();
      queue.next();
      
      const removed = queue.dequeue();
      expect(removed).toEqual(mockPredictions[2]);
      
      // Now: [1, 2], index should step back to 1 (item 2)
      expect(queue.size()).toBe(2);
      expect(queue.getCurrentIndex()).toBe(1);
      expect(queue.peek()).toEqual(mockPredictions[1]);
    });

    it('should handle clearing via dequeue', () => {
      queue.enqueue([mockPredictions[0]]);
      queue.dequeue();
      
      expect(queue.size()).toBe(0);
      expect(queue.peek()).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all items and reset index', () => {
      queue.enqueue(mockPredictions);
      queue.next();
      
      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.getCurrentIndex()).toBe(0);
      expect(queue.peek()).toBeNull();
    });
  });
});
