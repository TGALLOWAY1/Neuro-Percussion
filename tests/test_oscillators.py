import unittest
import torch
import numpy as np
from engine.dsp.oscillators import Oscillator

class TestOscillators(unittest.TestCase):
    def setUp(self):
        self.sr = 48000
        self.freq = torch.tensor([440.0]) # A4
        self.duration = 0.1 # 100ms

    def test_sine_shape_and_range(self):
        wave = Oscillator.sine(self.freq, self.duration, self.sr)
        self.assertEqual(len(wave), int(self.duration * self.sr))
        self.assertTrue(torch.max(wave) <= 1.0001)
        self.assertTrue(torch.min(wave) >= -1.0001)

    def test_triangle_range(self):
        wave = Oscillator.triangle(self.freq, self.duration, self.sr)
        self.assertTrue(torch.max(wave) <= 1.0001)
        self.assertTrue(torch.min(wave) >= -1.0001)

    def test_determinism(self):
        # Oscillators are stateless math functions, but good to verify
        wave1 = Oscillator.sine(self.freq, self.duration, self.sr)
        wave2 = Oscillator.sine(self.freq, self.duration, self.sr)
        self.assertTrue(torch.allclose(wave1, wave2))

if __name__ == '__main__':
    unittest.main()
