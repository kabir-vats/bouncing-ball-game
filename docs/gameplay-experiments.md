# Gameplay Experiments

## Two-bounce reveal after each prediction

Status: tried and reverted.

Idea: after the intro, the ball sticks at a bounce and asks for a prediction. The player predicts the next bounce, then watches that predicted bounce plus one additional bounce before the ball sticks again for the next guess.

Sequence:

```text
intro -> bounce/stick/guess -> predicted bounce -> extra bounce -> stick/guess
```

Implementation sketch:

- Keep scoring tied to the immediate next bounce after the current pause.
- Extend the reveal animation to the bounce after the scored bounce when it exists.
- After reveal, set `pauseBounceIndex` to that later bounce so the next guess targets the following bounce.
- Fall back to the immediate next bounce near the end of a simulation.

Result: rejected in gameplay testing. The original rhythm, where each prediction resolves and sticks at the predicted bounce, felt better.
