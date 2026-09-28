PRD — Realtime Interactive Presentation Platform
Working Name

PresentX — a realtime presentation and audience-interaction platform for classrooms, workshops, seminars, technical events, and IEEE sessions.

Core idea:
The presenter controls one presentation from any device, while every connected audience device stays synchronized in realtime. Audience members don't need accounts.

1. Product Overview

The application allows a presentation creator to create a presentation room, prepare slides, start a live session, and control the presentation from a separate device.

Audience members join using:

Room code
QR code
Join URL

No account is required for audience members.

Once joined:

                    ┌─────────────────────┐
                    │     Admin Device    │
                    │   Controller Mode   │
                    └──────────┬──────────┘
                               │
                         WebSocket
                               │
                    ┌──────────▼──────────┐
                    │   Realtime Room     │
                    │ Cloudflare / PartyKit│
                    └───────┬───────┬──────┘
                            │       │
                WebSocket   │       │   WebSocket
                            │       │
              ┌─────────────▼─┐   ┌─▼─────────────┐
              │ Presentation  │   │ Audience      │
              │ Screen        │   │ Devices       │
              └───────────────┘   └───────────────┘

The presentation screen and audience screens are synchronized in realtime.

For example:

Admin clicks Next Slide → presentation screen changes → 100 audience devices receive the new slide state.

2. Problem

Traditional presentations are mostly one-way.

The presenter:

Presenter
    ↓
PowerPoint / Google Slides
    ↓
Audience

The audience has limited participation.

For an IEEE workshop/class, the presenter may want:

Live quizzes
Polls
Surveys
Ratings
Questions
Sliders
Interactive diagrams
Clickable elements
Audience feedback
Live results
Timers
Multiple form fields on one slide

Existing presentation tools often require switching between multiple applications.

This platform combines:

Presentation + Realtime Control + Audience Interaction

into one application.

3. Product Goals
Primary goals
Create presentation rooms.
Allow presenters to control presentations remotely.
Synchronize all connected devices in realtime.
Allow audiences to join without registration.
Support QR/code-based joining.
Build presentations using a custom slide editor.
Support image-based slides.
Support interactive slides.
Support quizzes.
Support surveys.
Support ratings.
Support sliders.
Show live quiz results.
Keep private survey results visible only to the presenter.
Support multiple interactive elements on one slide.
Allow presentations to run from different devices.
Make the platform usable for classrooms, workshops and events.
4. Non-Goals for Initial Version

Don't try to build all of PowerPoint.

The initial version should not attempt to support:

Complex video editing
Advanced animations
3D objects
Full PowerPoint compatibility
Complex transitions
Offline collaborative editing
AI-generated presentations
Multi-presenter editing
Enterprise administration

These can come later.

5. Target Users
5.1 Presentation Creator

Examples:

IEEE organizers
College professors
Students
Workshop speakers
Trainers
Event organizers
Corporate trainers

They create and control presentations.

5.2 Audience Member

Examples:

Students
Workshop participants
Employees
Event attendees

They:

Join rooms
View slides
Answer quizzes
Submit surveys
Rate content
Interact with elements

No account required.

6. User Roles
Role	Account	Create Room	Control Room	Edit Slides	Interact
Creator/Admin	Required	Yes	Yes	Yes	Yes
Presenter Device	Admin session	No	Yes	Optional	No
Audience	No	No	No	No	Yes
Guest	No	No	No	No	Yes

A creator account is required only for persistent presentation management.

7. Authentication
Creator authentication

Use:

Supabase Auth

Possible methods:

Email/password
Google
GitHub
Magic link

For MVP:

Email + password

is enough.

8. Main Application Structure
/
├── Landing Page
│
├── /login
├── /signup
│
├── /dashboard
│   ├── Presentations
│   ├── Rooms
│   └── Account
│
├── /presentation/[id]
│   └── Slide Editor
│
├── /present/[roomCode]
│   └── Presentation Screen
│
├── /control/[roomCode]
│   └── Admin Controller
│
└── /join/[roomCode]
    └── Audience Interface
9. Core User Journey
Creator Journey
Signup
  ↓
Dashboard
  ↓
Create Presentation
  ↓
Add Slides
  ↓
Add Interactive Slides
  ↓
Configure Quiz / Survey
  ↓
Save
  ↓
Create Live Room
  ↓
Generate Room Code + QR
  ↓
Start Presentation
  ↓
Control from device
10. Audience Journey
Scan QR
     ↓
Join Page
     ↓
Enter Display Name
     ↓
Join Room
     ↓
Realtime Connection
     ↓
Receive Current Slide
     ↓
Wait / Interact

No login.

11. Room Concept

A Room is a temporary realtime session associated with a presentation.

Example:

Presentation:
"Introduction to Agentic AI"

Room:
AI2026

Join:
presentx.app/join/AI2026

Room generates:

Room ID
Room code
QR code
Join URL
12. Room States

A room can have:

DRAFT
READY
LIVE
PAUSED
ENDED
DRAFT

Room created but presentation hasn't started.

READY

Room is prepared for presentation.

LIVE

Audience can join and realtime synchronization is active.

PAUSED

Presenter temporarily stops interaction.

ENDED

Presentation has finished.

Audience receives:

This presentation has ended.

13. Room Architecture

Each room has a realtime state.

Example:

interface RoomState {
  roomId: string;

  presentationId: string;

  status: "ready" | "live" | "paused" | "ended";

  currentSlideId: string;

  currentSlideIndex: number;

  timer?: {
    startedAt: number;
    duration: number;
    running: boolean;
  };

  activeInteraction?: {
    interactionId: string;
    status: "open" | "closed";
  };
}
14. Realtime Architecture

Recommended architecture:

                 Next.js
                    │
        ┌───────────┴───────────┐
        │                       │
   Supabase                  R2
 Database                   Storage
        │                       │
        └───────────┬───────────┘
                    │
             Cloudflare
                    │
              PartyKit Room
                    │
             WebSocket Server
                    │
       ┌────────────┼────────────┐
       │            │            │
    Admin       Presenter     Audience
    Device       Screen        Devices
15. What Should Be Realtime?

Only realtime state should travel through WebSocket.

Realtime
Current slide
Next/previous slide
Presentation start
Presentation end
Timer
Quiz open/close
Quiz answers
Live quiz results
Audience count
Interactive element state
Selected element state if necessary
Canvas interaction events
Poll results
Slider responses
Rating results
Database

Use Supabase for persistent data:

Users
Presentations
Slides
Slide elements
Questions
Options
Rooms
Responses
Presentation metadata
R2

Use R2 for:

Slide images
Uploaded images
Logos
Backgrounds
Presentation assets
16. Important Architecture Principle

Don't send entire slide documents through WebSocket repeatedly.

Bad:

Admin
 ↓
Entire presentation JSON
 ↓
WebSocket
 ↓
Every device

Instead:

Admin:
"CURRENT_SLIDE_CHANGED"

{
  slideId: "slide_08"
}

Clients already know the presentation data.

For live interactions:

QUIZ_STARTED
QUIZ_RESPONSE
QUIZ_RESULTS_UPDATED
TIMER_STARTED
SLIDE_CHANGED
PRESENTATION_ENDED

This keeps the realtime layer lightweight.

17. WebSocket Event System

Example events:

type RealtimeEvent =
  | SlideChangedEvent
  | PresentationStartedEvent
  | PresentationEndedEvent
  | QuizStartedEvent
  | QuizResponseEvent
  | QuizResultsUpdatedEvent
  | SurveyOpenedEvent
  | SurveyResponseEvent
  | TimerStartedEvent
  | TimerStoppedEvent
  | AudienceJoinedEvent
  | AudienceLeftEvent;

Example:

{
  "type": "SLIDE_CHANGED",
  "payload": {
    "slideId": "slide_12",
    "index": 11
  }
}
18. Presentation Editor

The presentation editor is one of the most important components.

The UX should feel familiar to:

Google Slides
PowerPoint
Canva

but initially with a much smaller feature set.

19. Editor Layout
┌─────────────────────────────────────────────┐
│ Logo    File    Edit       Present   Share  │
├────────────┬────────────────────┬───────────┤
│            │                    │            │
│ Slides     │                    │ Properties │
│            │     CANVAS         │            │
│ ┌───────┐  │                    │            │
│ │  01   │  │                    │            │
│ └───────┘  │                    │            │
│            │                    │            │
│ ┌───────┐  │                    │            │
│ │  02   │  │                    │            │
│ └───────┘  │                    │            │
│            │                    │            │
│ + Slide    │                    │            │
└────────────┴────────────────────┴────────────┘
20. Slide Editor Features
Basic
Create slide
Delete slide
Duplicate slide
Reorder slide
Rename slide
Background color
Background image
Image upload
Text
Shapes
Lines
Icons
Links
21. Canvas

Use a coordinate-based canvas.

Each element:

interface SlideElement {
  id: string;

  type:
    | "text"
    | "image"
    | "shape"
    | "icon"
    | "button"
    | "link"
    | "quiz"
    | "survey"
    | "rating"
    | "slider";

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: number;

  zIndex: number;

  properties: Record<string, unknown>;
}
22. Canvas Interaction

Support:

Drag
Resize
Rotate
Delete
Duplicate
Copy/paste
Multi-select
Alignment
Bring forward
Send backward
Lock
Group

Later:

Snap to grid
Smart guides
Keyboard shortcuts
Undo/redo
Layers
23. Slide Types

The system should distinguish between normal and interactive slides.

Type 1 — Normal Slide

Example:

┌──────────────────────────┐
│       Introduction       │
│                          │
│       Agentic AI         │
│                          │
│       IEEE Workshop      │
└──────────────────────────┘

Audience sees:

No interaction enabled

Type 2 — Interactive Slide

Example:

┌──────────────────────────┐
│ How familiar are you?    │
│                          │
│ ○ Beginner               │
│ ○ Intermediate           │
│ ○ Advanced               │
│                          │
│        SUBMIT             │
└──────────────────────────┘

Audience receives interactive controls.

24. Interaction Types

This should be extensible.

Create an interaction framework:

Interaction
├── Multiple Choice
├── Multiple Select
├── Short Text
├── Long Text
├── Rating
├── Slider
├── Yes / No
├── Poll
├── Button
├── Link
├── Image
└── Custom Element
25. Quiz

Admin can create a quiz question.

Example:

Question:
What does API stand for?

○ Application Programming Interface
○ Automated Programming Interface
○ Application Protocol Interface
○ Advanced Programming Interface

Admin config:

Question
Options
Correct answer
Multiple answers
Points
Time limit
Explanation
Randomize options
Allow retry
Show correct answer
26. Live Quiz

During presentation:

                 PRESENTATION SCREEN

        What does API stand for?

        ████████████████████  62%
        ████████              23%
        ███                    9%
        ██                     6%

Audience:

What does API stand for?

○ Application Programming Interface
○ Automated Programming Interface
○ Application Protocol Interface
○ Advanced Programming Interface

        [ SUBMIT ]

Results are pushed through WebSocket.

27. Quiz Result Architecture

Audience submits:

QUIZ_RESPONSE

PartyKit validates:

room
quiz
participant
option

Then updates aggregated result:

{
  "optionA": 62,
  "optionB": 23,
  "optionC": 9,
  "optionD": 6
}

Broadcast:

QUIZ_RESULTS_UPDATED

to:

Presentation screen
Admin controller

Optionally don't broadcast to audience.

28. Survey

Survey responses are different from quizzes.

Example:

How useful was this session?

1 ⭐
2 ⭐⭐
3 ⭐⭐⭐
4 ⭐⭐⭐⭐
5 ⭐⭐⭐⭐⭐

Results should be visible only to admin unless configured otherwise.

29. Privacy Model
Quiz

Can be:

Public result
Admin-only result
Survey

Default:

Admin-only
Participant identity

Audience can optionally enter:

Name

But no account is necessary.

30. Rating Component

Example:

How would you rate this session?

☆ ☆ ☆ ☆ ☆

Configuration:

Minimum: 1
Maximum: 5
Icon: Star
Allow half rating: Yes/No
31. Slider

Example:

How confident are you with AI?

0 ────────●──────── 100
          65

Configuration:

Minimum
Maximum
Step
Label
Unit
Default value
32. Multiple Form Fields on One Slide

This is an important feature.

Example:

┌──────────────────────────────────┐
│       Workshop Feedback          │
│                                  │
│ Name                             │
│ [________________________]       │
│                                  │
│ How useful?                      │
│ ★ ★ ★ ★ ★                        │
│                                  │
│ Confidence                       │
│ ───────────●────────             │
│                                  │
│ Would you recommend this?        │
│ ○ Yes       ○ No                 │
│                                  │
│              [ SUBMIT ]           │
└──────────────────────────────────┘

One slide can contain multiple interactive elements.

33. Interactive Canvas Elements

The presenter can place:

Buttons
[ Click Me ]
Links
Open Documentation →
Images
[ Image ]
Icons
🔗   ❤️   👍   🚀
Interactive buttons

Example:

Which technology interests you?

[ AI ]

[ Cloud ]

[ Cybersecurity ]

[ Web Development ]

Admin can see clicks in realtime.

34. Interaction Configuration Panel

When selecting an interactive element:

┌─────────────────────┐
│ Element             │
├─────────────────────┤
│ Type                │
│ Button              │
│                     │
│ Label               │
│ [Vote for AI]       │
│                     │
│ Action              │
│ Submit Response     │
│                     │
│ Response ID         │
│ ai_interest         │
│                     │
│ Required            │
│ ☑                   │
└─────────────────────┘
35. Presenter Screen

The presentation screen should be extremely clean.

┌─────────────────────────────────────┐
│                                     │
│                                     │
│          PRESENTATION               │
│                                     │
│                                     │
└─────────────────────────────────────┘

No editor controls.

Optional small overlay:

LIVE ●
36. Controller Screen

The admin controller is more feature-rich.

┌─────────────────────────────────────────────┐
│ LIVE     42 participants       END SESSION │
├───────────────────┬─────────────────────────┤
│                   │                         │
│ Current Slide     │ Next Slide              │
│                   │                         │
│                   │                         │
├───────────────────┴─────────────────────────┤
│ ← Previous     12 / 30       Next →        │
├─────────────────────────────────────────────┤
│ Interaction                                 │
│                                             │
│ Quiz active                                  │
│ Responses: 38                               │
│ [Close Quiz]                                 │
└─────────────────────────────────────────────┘
37. Controller Features

Admin can:

Start presentation
Pause presentation
Next
Previous
Jump to slide
Start quiz
Stop quiz
Start timer
Stop timer
Show results
Hide results
View participant count
View responses
End session
38. Separate Presenter + Controller Devices

This is a core feature.

Example:

Laptop
Presentation Screen
Phone
Controller

Both connect to the same room.

Phone
  │
  │ WebSocket
  ▼
Room
  │
  │ WebSocket
  ▼
Laptop

Phone changes:

Slide 5 → Slide 6

Laptop immediately displays Slide 6.

39. Audience Screen

Audience UI should be intentionally simple.

Normal slide
┌──────────────────────────┐
│                          │
│       PRESENTATION       │
│                          │
│                          │
│ No interaction enabled   │
│                          │
└──────────────────────────┘
Interactive slide
┌──────────────────────────┐
│                          │
│ Which language do you    │
│ prefer?                  │
│                          │
│ ○ Java                   │
│ ○ Python                 │
│ ○ JavaScript             │
│                          │
│ [ Submit ]               │
└──────────────────────────┘
40. Join Experience

Audience scans QR.

        IEEE WORKSHOP

       ┌─────────────┐
       │             │
       │     QR      │
       │             │
       └─────────────┘

     Scan to participate

     Room: AI2026

After scanning:

Welcome!

Name
[ Abin                    ]

[ JOIN SESSION ]

Then:

✓ Connected

Waiting for interaction...
41. QR Code

Every active room generates:

https://presentx.app/join/AI2026

QR points to this URL.

Presenter screen should optionally show:

Join:
presentx.app/join/AI2026

        [ QR CODE ]
42. Audience Connection Handling

WebSocket connection lifecycle:

CONNECT
   ↓
AUTHENTICATE ROOM TOKEN
   ↓
JOIN ROOM
   ↓
RECEIVE CURRENT STATE
   ↓
READY

If connection drops:

Disconnected

Reconnecting...

After reconnect:

SYNC_STATE

Client should receive the current slide and active interaction.

43. Reconnection

This is essential.

Example:

Audience loses WiFi
       ↓
WebSocket disconnect
       ↓
Reconnect
       ↓
Room state requested
       ↓
Current slide received
       ↓
User continues

Don't depend entirely on event history.

Maintain an authoritative room state.

44. Room State Model
interface LiveRoomState {
  roomId: string;

  presentationId: string;

  currentSlideId: string;

  currentSlideIndex: number;

  status: RoomStatus;

  activeInteractionId?: string;

  interactionStatus?: "open" | "closed";

  timer?: TimerState;

  participantCount: number;
}
45. Presentation Data Model

Recommended database hierarchy:

User
 │
 └── Presentation
       │
       ├── Slides
       │     ├── Elements
       │     └── Interactions
       │
       └── Rooms
             └── Responses
46. Supabase Database
users

Supabase Auth handles authentication.

presentations
id
owner_id
title
description
thumbnail_url
created_at
updated_at
status
slides
id
presentation_id
order_index
title
type
background
created_at
updated_at
slide_elements
id
slide_id
type

x
y
width
height
rotation
z_index

properties JSONB

created_at
updated_at
interactions
id
slide_id

type

title
description

config JSONB

required

created_at
updated_at
interaction_fields

For complex forms:

id
interaction_id

field_type
label
name
required
order_index

config JSONB
rooms
id
presentation_id
owner_id

room_code

status

started_at
ended_at

created_at
participants
id
room_id

display_name

session_token

joined_at
last_seen_at

Do not require a Supabase user account.

responses
id
room_id
interaction_id
participant_id

response JSONB

created_at
assets
id
owner_id
presentation_id

bucket
object_key

file_name
mime_type
size

created_at
47. R2 Storage Structure

Recommended:

presentations/
    {presentationId}/
        slides/
            slide-001.png
            slide-002.png

        assets/
            image-001.webp
            logo.svg

        backgrounds/
            bg-001.webp

Use signed URLs where appropriate.

48. Security Architecture

The biggest security rule:

Audience devices must never receive admin-only information.

For example:

Survey Results
        ↓
Admin WebSocket only

not:

Room Broadcast
        ↓
Everyone
49. WebSocket Authorization

Room connection should contain a signed session token.

Admin
role: ADMIN
roomId: abc123
Presenter
role: PRESENTER
roomId: abc123
Audience
role: PARTICIPANT
roomId: abc123
participantId: xyz

PartyKit should validate permissions before accepting privileged events.

50. Admin Event Protection

Audience must not be able to send:

SLIDE_CHANGED
END_PRESENTATION
START_QUIZ
SHOW_RESULTS

Only:

ADMIN
PRESENTER

can send those events.

51. Audience Event Permissions

Audience can send:

JOIN_ROOM
QUIZ_RESPONSE
SURVEY_RESPONSE
RATING_RESPONSE
SLIDER_RESPONSE
BUTTON_CLICK

but cannot modify presentation state.

52. Rate Limiting

Important because audience endpoints are public.

Limit:

Join requests
Responses
WebSocket connections
Button clicks
API requests

Potential architecture:

Cloudflare
   ↓
Rate limiting
   ↓
PartyKit
53. Presentation Editor Autosave

Editor should autosave.

Example:

User changes element
       ↓
Local state
       ↓
Debounce 500–1000ms
       ↓
Save to Supabase

Don't save on every mouse movement.

For drag operations:

drag start
    ↓
local updates
    ↓
drag end
    ↓
persist
54. Undo / Redo

Implement editor history.

Action
 ↓
History Stack

Undo
 ↓
Previous state

Redo
 ↓
Next state

MVP:

Text changes
Element movement
Element deletion
Element creation
55. Presentation Editor Technology

For the canvas, you can use a canvas library rather than building everything from scratch.

Architecture:

React
 ↓
Canvas abstraction
 ↓
Element model
 ↓
Supabase persistence

The important thing is to keep your own normalized element schema so the renderer can change later.

56. Responsive Strategy

Presentation canvas should use a fixed logical resolution.

For example:

16:9

1280 × 720

Elements use logical coordinates.

On different screens:

1280 × 720
1920 × 1080
1366 × 768
Mobile

the renderer scales the same logical canvas.

This is much better than storing viewport-specific coordinates.

57. Presentation Rendering

Example:

Slide
 ├── Background
 ├── Text
 ├── Image
 ├── Shape
 ├── Button
 └── Interaction

Rendering pipeline:

Slide JSON
   ↓
React Renderer
   ↓
DOM / Canvas
   ↓
Presentation Screen
58. Admin Dashboard

Dashboard:

┌────────────────────────────────────────────┐
│ Welcome back, Abin                         │
│                                            │
│ [+ Create Presentation]                    │
│                                            │
├────────────────────────────────────────────┤
│ Recent Presentations                       │
│                                            │
│ AI Workshop             Edited 2h ago      │
│ IEEE Orientation        Edited yesterday   │
│ Cybersecurity 101       Edited 4d ago      │
└────────────────────────────────────────────┘
59. Presentation Management

Each presentation supports:

Open
Edit
Duplicate
Rename
Delete
Present
Create room
View analytics
60. Presentation Analytics

After session:

Participants
142

Questions
5

Responses
638

Average Rating
4.4 / 5

Completion
82%

For each interaction:

Question 1

A: 43
B: 67
C: 21
D: 11
61. Session History

Store:

Presentation
Room
Start time
End time
Participants
Responses

This lets the creator review previous sessions.

62. Template System

Later add templates:

Workshop
Lecture
Quiz
IEEE Event
Corporate Training
Classroom
Conference

A template is just predefined slide structure.

63. Presentation Templates

Example:

IEEE Workshop Template
Slide 1
Title

Slide 2
Speaker introduction

Slide 3
Agenda

Slide 4
Interactive poll

Slide 5
Content

Slide 6
Quiz

Slide 7
Results

Slide 8
Feedback

Slide 9
Thank you
64. Realtime Result Visualization

For quizzes:

Horizontal bars
Vertical bars
Percentages
Number of responses

Example:

JavaScript

████████████████████ 45%

Python

██████████████ 32%

Java

████████ 18%

Other

██ 5%

The presentation display updates automatically.

65. Timer

Admin can configure:

Duration: 60 seconds

Controller:

01:00

Presentation:

00:42

Audience:

00:42

Use a timestamp-based timer rather than continuously broadcasting every second.

Instead of:

TICK
TICK
TICK
TICK

broadcast:

{
  "startedAt": 1720000000,
  "duration": 60
}

Clients calculate the remaining time locally.

This dramatically reduces WebSocket traffic.

66. Presentation Controls

Keyboard support:

→ Next
← Previous
Space Next
Esc Exit
F Fullscreen

Later:

P Presenter view
67. Fullscreen Mode

Presentation:

Browser
   ↓
Fullscreen
   ↓
16:9 presentation

Controller should not need fullscreen.

68. Mobile Controller

The controller should be optimized for mobile.

┌──────────────────────┐
│ IEEE Workshop        │
│ ● LIVE               │
├──────────────────────┤
│ Slide 12 / 30        │
│                      │
│      Preview         │
│                      │
├──────────────────────┤
│                      │
│   ←       →          │
│                      │
├──────────────────────┤
│ Quiz                 │
│ 42 responses         │
│ [Close]              │
└──────────────────────┘
69. Offline Behavior

Audience:

If disconnected:

Connection lost
Reconnecting...

Admin:

If controller disconnects:

Presentation continues

The presentation screen should not automatically end just because the controller disconnects.

70. Important Room Behavior

If admin closes the controller accidentally:

Presentation → continues

If presentation device disconnects:

Room → continues

If admin explicitly presses:

End Presentation

then:

Room → ENDED
71. End Presentation

Admin confirmation:

End presentation?

Audience members will no longer
be able to interact.

[ Cancel ]    [ End Presentation ]

Then broadcast:

PRESENTATION_ENDED

Audience:

Session ended.

Thank you for participating.
72. Error States

Need dedicated UX for:

Room doesn't exist
Room not found.
Check the room code.
Room ended
This session has ended.
Room full
This session is currently full.
Connection failure
Connection lost.
Trying to reconnect...
Invalid QR
Invalid session link.
73. Performance Requirements

Target:

Initial MVP
50–100 participants

per room.

Later:

500+

depending on architecture and load testing.

74. Realtime Performance Targets

Target:

Admin action
     ↓
PartyKit
     ↓
Clients

Desired perceived synchronization:

sub-second under normal network conditions.

Don't promise a fixed latency because actual latency depends on network and geographic location.

75. Database vs Realtime Responsibility

This separation is critical.

Supabase
Source of truth for persistent data
PartyKit
Source of truth for current live room state
R2
Source of truth for large binary assets
76. Recommended Project Architecture

Since you're using Next.js:

apps/
│
├── web/
│   └── Next.js
│
├── realtime/
│   └── PartyKit / Cloudflare
│
└── worker/
    └── Cloudflare Workers

Libraries:

packages/
│
├── ui/
├── database/
├── presentation-engine/
├── realtime/
├── auth/
├── storage/
├── validation/
└── types/
77. Next.js Structure
app/
├── (marketing)/
│
├── auth/
│   ├── login/
│   └── signup/
│
├── dashboard/
│
├── presentation/
│   └── [id]/
│
├── control/
│   └── [roomCode]/
│
├── present/
│   └── [roomCode]/
│
└── join/
    └── [roomCode]/
78. Core Packages
presentation-engine

Responsible for:

Slide rendering
Element rendering
Interaction rendering
Canvas coordinates
realtime

Responsible for:

WebSocket client
Event definitions
Connection management
Room state
database

Responsible for:

Supabase queries
Database types
Repositories
storage

Responsible for:

R2 upload
Signed URLs
Asset management
validation

Use schemas for:

Room events
Slides
Elements
Quiz configuration
Responses
79. TypeScript Shared Types

Create shared contracts.

type SlideType =
  | "normal"
  | "interactive";
type InteractionType =
  | "quiz"
  | "poll"
  | "survey"
  | "rating"
  | "slider"
  | "text"
  | "button";
type RoomRole =
  | "admin"
  | "presenter"
  | "participant";

These types should be shared between:

Next.js
PartyKit
Client
80. API Responsibility

Traditional API:

Authentication
Presentation CRUD
Slide CRUD
Asset upload
Analytics

WebSocket:

Live room state
Presentation control
Audience interactions
Live results
81. Upload Architecture

Don't upload large files through your realtime server.

Use:

Browser
   ↓
Request upload authorization
   ↓
Cloudflare R2
   ↓
Return asset URL
   ↓
Save asset metadata in Supabase
82. Slide Image Upload

User can upload:

PNG
JPG
WEBP
SVG

Potential limits should be configured later.

The system generates:

Original
Optimized version
Thumbnail

if required.

83. Editor Autosave Architecture
User changes element
       ↓
React state
       ↓
Debounce
       ↓
Validation
       ↓
Supabase

Use optimistic UI.

The user should not wait for Supabase after every edit.

84. State Architecture

For the frontend:

Server state
    ↓
Supabase

Live state
    ↓
WebSocket

Local editor state
    ↓
React / Zustand-style store

Don't put everything into one state mechanism.

85. Suggested MVP

The first version should be much smaller than the final vision.

MVP includes
Authentication
Signup
Login
Logout
Presentation
Create presentation
Rename
Delete
Slides
Text
Images
Basic shapes
Room
Create room
Room code
QR code
Join without account
Realtime
Current slide synchronization
Next
Previous
End session
Audience
Join
View presentation
Normal slide
"No interaction enabled"
Interaction
Multiple choice quiz
Timer
Live results

This is enough to prove the core product.

86. Phase 1 — Foundation
Goal

Build infrastructure.

Tasks:

Create Next.js application
Configure Supabase
Configure authentication
Configure database
Configure R2
Configure PartyKit
Configure Cloudflare
Create shared TypeScript types
Set up deployment pipeline
Environment configuration

Deliverable:

Next.js
+
Supabase
+
R2
+
PartyKit

all communicating correctly.

87. Phase 2 — Authentication + Dashboard

Build:

Signup
Login
Logout
Dashboard
Presentation creation
Presentation listing
Presentation deletion
Presentation rename

Deliverable:

User
 ↓
Dashboard
 ↓
Presentation
88. Phase 3 — Presentation Editor

Build:

Slide creation
Slide deletion
Slide reorder
Text
Images
Shapes
Background
Drag
Resize
Layering
Autosave

Then:

Undo
Redo
Duplicate

Deliverable:

A usable lightweight Google Slides-style editor.

89. Phase 4 — Room System

Build:

Create room
Generate room code
QR code
Join URL
Room states
Room expiration
Room permissions

Deliverable:

Presentation
      ↓
Live Room
      ↓
Join QR
90. Phase 5 — WebSocket Infrastructure

Build PartyKit room.

Implement:

CONNECT
JOIN
SYNC_STATE
SLIDE_CHANGED
PRESENTATION_STARTED
PRESENTATION_ENDED

Test:

Laptop
Phone
Tablet

all synchronized.

91. Phase 6 — Presentation + Controller

Build:

Presentation screen
Fullscreen
Slide rendering
Current slide
Controller
Slide preview
Next
Previous
Jump to slide
End session
Participant count

Test:

Phone controller
        ↓
PartyKit
        ↓
Laptop presentation
92. Phase 7 — Audience System

Build:

QR join
Room code join
Display name
Participant session
Connection status
Reconnect
Current slide sync

Normal slide:

No interaction enabled
93. Phase 8 — Quiz Engine

Implement:

Question types

First:

Single choice
Multiple choice

Then:

Yes/No
Text

Configuration:

Options
Correct answer
Timer
Points
Required
Results visibility
94. Phase 9 — Live Quiz Results

Build:

Audience response
       ↓
PartyKit
       ↓
Aggregate
       ↓
Presentation

Presentation displays:

Live Results

Controller displays:

Responses
Correct %
95. Phase 10 — Survey System

Add:

Rating
Slider
Text
Multiple choice
Yes/No

Build response aggregation.

Admin dashboard:

Survey Results
96. Phase 11 — Interactive Canvas

Add interactive elements:

Button
Icon
Link
Image
Quiz
Rating
Slider
Form

Allow multiple elements per slide.

This is where the product becomes significantly more differentiated from a normal presentation viewer.

97. Phase 12 — Analytics

Build:

Session Analytics

Metrics:

Participants
Responses
Completion
Quiz accuracy
Average rating
Interaction rate
98. Phase 13 — Advanced Editor

Add:

Groups
Alignment
Smart guides
Grid
Snap
Keyboard shortcuts
Layers panel
Rich text
Better image controls
Gradients
Borders
Shadows
Transparency
Advanced shapes
99. Phase 14 — Templates

Create:

IEEE Workshop
Classroom
Quiz
Conference
Corporate
Seminar

Users can start from templates.

100. Phase 15 — Production Scaling

Before large public launch:

Load testing

Test:

10 participants
50
100
250
500
1000

per room.

Measure:

WebSocket connections
Memory
CPU
Message rate
Database writes
Response latency
101. Important Scaling Optimization

Do not write every audience response individually to Supabase synchronously if thousands of people are answering simultaneously.

Instead:

Audience
   ↓
PartyKit
   ↓
Realtime aggregation
   ↓
Batch persistence
   ↓
Supabase

For example:

1000 responses
      ↓
aggregate in realtime
      ↓
persist batches

This avoids unnecessary database pressure.

102. Response Storage Strategy

You can maintain:

Raw response

For analytics:

participant
question
answer
timestamp
Aggregated response

For realtime:

question
option
count
percentage

The latter can be maintained in the realtime layer.

103. Event Sourcing Consideration

For MVP, don't over-engineer.

Use:

Current room state
+
persistent responses

Later, if required:

Room Event Log

could record:

SLIDE_CHANGED
QUIZ_STARTED
QUIZ_CLOSED
SESSION_ENDED

This can help with debugging and analytics.

104. Admin vs Presenter Permissions

Potential future feature:

Owner
 ├── Admin
 ├── Presenter
 └── Moderator

For MVP:

Creator = Admin

and optionally a presenter token for a second device.

105. Future Moderator Role

A moderator could:

Monitor questions
Moderate audience responses
Start/stop polls
View participant information

without being allowed to edit the presentation.

106. Future Question Mode

Audience could submit questions:

Ask a question

[______________________]

[ Submit ]

Admin sees:

Questions

👍 24   How does AI work?
👍 18   What about security?
👍 11   Can I build this locally?

This can become a major future feature.

107. Future Reaction System

Add:

👍
❤️
🔥
👏
🤔

Audience clicks reactions.

Presenter sees live reaction count.

This should be rate-limited heavily.

108. Future Attendance

Because users join rooms, you can optionally track:

Participant
Joined
Left
Duration
Interactions

Then:

Attendance Report

But make this configurable and privacy-conscious.

109. Future Collaboration

Later:

Multiple editors

could edit a presentation simultaneously.

That is a different problem from live presentation synchronization and should not be mixed into the MVP.

110. Recommended UX Principle

Separate the product into three experiences:

1. Create
Dashboard → Editor
2. Control
Controller
3. Experience
Presentation + Audience

Don't mix them.

111. Final Product Architecture
                       ┌─────────────────┐
                       │     Next.js     │
                       │                 │
                       │ Dashboard       │
                       │ Editor          │
                       │ Controller      │
                       │ Audience UI     │
                       └────────┬────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       ┌───────────┐      ┌────────────┐     ┌──────────┐
       │ Supabase  │      │ PartyKit   │     │ Cloudflare│
       │           │      │            │     │ R2       │
       │ Auth      │      │ WebSocket  │     │          │
       │ Database  │      │ Room State │     │ Assets   │
       └───────────┘      └─────┬──────┘     └──────────┘
                                │
                   ┌────────────┼────────────┐
                   │            │            │
                   ▼            ▼            ▼
                Admin       Presenter     Audience
                Device        Screen       Devices
112. MVP → Full Product Roadmap
Phase	Feature	Priority
1	Infrastructure	P0
2	Auth + Dashboard	P0
3	Slide Editor	P0
4	Room System	P0
5	WebSocket Sync	P0
6	Controller	P0
7	Audience Join	P0
8	Quiz	P0
9	Live Results	P0
10	Surveys	P1
11	Interactive Canvas	P1
12	Analytics	P1
13	Advanced Editor	P1
14	Templates	P2
15	Scaling	P0 before launch
16	Q&A	P2
17	Reactions	P2
18	Attendance	P2
19	Collaboration	P3
113. Definition of Done for MVP

The MVP is successful when this exact scenario works:

Presenter
Creates account.
Creates presentation.
Adds 5 slides.
Adds a quiz.
Creates a room.
Opens presentation screen on laptop.
Opens controller on phone.
Shows QR code.
Audience
20 students scan QR.
Students join without accounts.
Everyone receives current slide.
Presenter taps Next on phone.
All screens change.
Presenter reaches quiz slide.
Students answer.
Results update live.
Presentation screen displays bar chart.
Presenter moves to next slide.
Students synchronize.
Presenter presses End Session.
All audience screens show session-ended state.

If this works reliably, you have the core product.

114. Recommended Development Order

Don't start with the full Google Slides clone.

Build this sequence:

                    ┌─────────────┐
                    │ Auth        │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │ Presentation│
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │ Basic Editor│
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │ Room        │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │ WebSocket   │
                    └──────┬──────┘
                           ↓
                ┌──────────┴──────────┐
                ↓                     ↓
          Controller             Presentation
                │                     │
                └──────────┬──────────┘
                           ↓
                     Audience
                           ↓
                       Quiz
                           ↓
                   Live Results
                           ↓
                  Interactive Canvas
                           ↓
                     Analytics
The most important architectural decision

Treat the presentation itself and the live room state as two separate things.

PRESENTATION
─────────────
Slides
Elements
Questions
Images
Configuration

        ↓

LIVE ROOM
─────────
Current slide
Timer
Active interaction
Responses
Participants
Session status

Supabase owns the first. PartyKit owns the second. R2 owns the large assets.

That separation will make the system much easier to scale, debug, and extend later.

For your IEEE use case specifically, I would build the room synchronization + controller + audience + one quiz type before investing heavily in the Google Slides-style editor. That proves the unique part of the product first; the editor can then grow incrementally around the proven realtime engine.