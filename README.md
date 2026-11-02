# The Buzzz of the Commons

**A sonified neighbourhood powered by local green energy**

> *What if the way we share energy could be heard?*

The Buzzz of the Commons is a first-person walk through a neighbourhood powered by locally generated green energy. Each home produces a distinct tone as energy flows into it. Together, these tones form a collective soundscape that continuously changes with the neighbourhood's patterns of consumption.

When energy is used in balance, the neighbourhood finds its harmony. When individual consumption disrupts this balance, the soundscape changes, making the consequences of our actions perceptible to others.

Here, energy is not simply a resource delivered to individual homes. It becomes a shared condition of living together.

### [Enter the neighbourhood →](https://diclelidya.github.io/buzzz-of-the-commons/)

---

## Contents

- [The Idea](#the-idea)
- [An Infrastructure That Seeps into Space](#an-infrastructure-that-seeps-into-space)
- [The Experience](#the-experience)
- [How It Works](#how-it-works)
- [Every Session Is Different](#every-session-is-different)
- [The Web Prototype](#the-web-prototype)
- [Privacy & Weather Data](#privacy--weather-data)
- [Repository Structure](#repository-structure)
- [Run Locally](#run-locally)

---

## The Idea

The Buzzz of the Commons explores how becoming aware of what nature provides us might change the way we understand living together.

What if the changing conditions of nature became perceptible in the systems we inhabit? And what if, through this awareness, the relationships between individuals, communities and their environment became more tangible?

The project imagines a neighbourhood sharing a limited pool of locally generated renewable energy. Rather than treating energy as an invisible resource that simply flows into individual homes, it turns the relationship between natural production and collective consumption into a shared sensory experience.

Every household becomes part of a larger composition. Individual patterns of energy use contribute to a collective soundscape, making the interdependence of the neighbourhood something that can be heard and experienced.

The intention is not to distinguish between good and bad behaviour, or to prescribe a single way of consuming energy. Instead, it explores how making otherwise invisible relationships perceptible might create new forms of awareness, responsibility and commoning.

## An Infrastructure That Seeps into Space

*What happens when the infrastructure that sustains a community also becomes the space through which that community lives?*

The proposed energy network is imagined as more than a technical distribution system. Its pipelines extend throughout the neighbourhood, connecting homes, wrapping around buildings and gradually transforming into shared spatial environments.

These visible infrastructures make the otherwise invisible movement of energy tangible. They become architectural extensions of the energy system: connecting structures, occupying thresholds and creating new possibilities for shared spaces.

The infrastructure does not simply serve the neighbourhood; it gradually becomes part of it.

Energy, in this sense, is not only something that flows through architecture. It becomes a force that shapes spatial relationships and the ways a community inhabits its environment.

## The Experience

The prototype takes the form of a first-person walk through a neighbourhood micro-grid.

Rather than observing energy consumption through numbers, graphs or conventional interfaces, visitors encounter its effects through sound, movement and spatial relationships.

Each house becomes a situated sound source. As visitors approach a dwelling, its tone becomes more present; as they move away, it gradually recedes. The neighbourhood is therefore never heard from a single fixed perspective. Its collective soundscape changes with the visitor's position and movement.

As visitors move between houses, they encounter different tones, changing harmonies and moments of sonic disruption. Individual energy consumption becomes part of a larger composition, revealing how personal actions can influence a shared environment.

The experience invites visitors to consider their own position within a system of ecological interdependence.

## How It Works

The neighbourhood operates as a shared energy commons, where twenty-four houses draw from the same locally available renewable energy supply.

- **One shared supply:** The neighbourhood draws from renewable energy generated through local wind and solar conditions, supported by a constant hydro baseline.
- **Equal shares:** The available energy is divided equally among the twenty-four houses.
- **Every house has a voice:** Each house is assigned a musical note (C, D, E, G, A). As its energy consumption approaches its allocated share, its note becomes louder and plays more frequently, remaining in tune with the collective soundscape.
- **When balance breaks:** Once a house exceeds its allocated share, its note gradually drifts out of tune and a buzzing sound emerges. Its corresponding point cloud begins to shiver.
- **Your interaction:** The controls for adjusting individual household energy consumption are introduced on the welcome screen.
- **Spatial sound:** Each house is a sound source: louder as you approach, fading as you move away.

There is no score, no winning and no predefined ideal behaviour.

**Listen, wander and rebalance.**

## Every Session Is Different

The available energy follows real weather conditions at your approximate location.

A calm night leaves the neighbourhood relying mainly on its hydro baseline, while a windy and sunny afternoon can bring more energy into the commons, allowing the houses to find their harmony.

The same neighbourhood can sound different tomorrow, or in another city.

Weather is not simply a backdrop. It becomes an active condition shaping how the neighbourhood functions and sounds.

### What if your street ran on its own wind and sun?

The prototype borrows local weather data to explore a simple question:

> *What if the energy you used came from the wind and sun around you, and you shared it with your neighbours? Would your street be in tune tonight?*

It makes a limit we rarely notice perceptible: the relationship between what nature provides and what we collectively consume.

The question is not simply *"How can we use less?"* but rather:

> **"How can we use energy in tune with what nature provides?"**

### A note on the energy model

Energy availability is represented through a deliberately simplified model:

- **Wind** power increases with the cube of wind speed, subject to a maximum capacity.
- **Solar** generation follows solar radiation.
- **Hydro** provides a constant 6 kW supply as the baseline.

These calculations are designed to create an understandable and responsive experience, not to simulate an engineering-grade micro-grid.

## The Web Prototype

The current browser-based prototype is an early interactive exploration developed for the GameUp Türkiye Climate Hackathon (November 2026).

It translates the project's spatial and sonic ideas into a first-person environment, experimenting with the relationship between local weather, energy consumption, sound and collective behaviour.

### Current implementation

- First-person neighbourhood exploration
- Three.js-based real-time 3D environment
- Point-cloud-based spatial representation
- Web Audio-based sound generation
- Spatially positioned house sounds
- Weather-dependent energy availability
- Interactive adjustment of individual household consumption

> **Note:** The prototype is an experimental representation of the larger concept. The architectural energy infrastructure described above is a broader spatial proposition rather than a fully implemented physical system.

## Privacy & Weather Data

The prototype uses approximate location information to retrieve local weather conditions.

- Approximate location is inferred from your IP address using [ipapi.co](https://ipapi.co).
- Only coordinates rounded to two decimal places are sent to [Open-Meteo](https://open-meteo.com) to retrieve weather data.
- No location data or personal usage data is stored by the prototype.
- If either external service is unavailable, the experience falls back to default weather conditions.

## Repository Structure

| Folder | Description |
|---|---|
| `web/` | Browser-based interactive prototype |
| `pc_ply/` | Point-cloud assets (50% copy of the full export) |
| `solid/` | Solid geometry assets |

## Run Locally

The prototype runs directly in the browser without a build step.

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Start a local server:

   ```bash
   python -m http.server 8000
   ```

4. Open the prototype at [http://localhost:8000/web/](http://localhost:8000/web/).

---

*The Buzzz of the Commons is an exploration of how ecological interdependence might become something we can hear, inhabit and experience together.*
