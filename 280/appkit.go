// +build darwin

package main

import "unsafe"

/*
#include "appkit.h"
*/
import "C"

// Window is a window that an app displays on the screen.
//
// Reference: https://developer.apple.com/documentation/appkit/nswindow.
type Window struct {
	window unsafe.Pointer
}

// NewWindow returns a Window that wraps an existing NSWindow * pointer.
func NewWindow(window unsafe.Pointer) Window {
	return Window{window}
}

// Screen returns the screen the window is on.
//
// Reference: https://developer.apple.com/documentation/appkit/nswindow/1419232-screen.
func (w Window) Screen() Screen {
	return Screen{C.Window_Screen(w.window)}
}

// Screen describes the attributes of a computer's monitor or screen.
//
// Reference: https://developer.apple.com/documentation/appkit/nsscreen.
type Screen struct {
	screen unsafe.Pointer
}

// MaximumPotentialExtendedDynamicRangeColorComponentValue returns the
// maximum possible color component value for the screen when it's in
// extended dynamic range (EDR) mode.
//
// Reference: https://developer.apple.com/documentation/appkit/nsscreen/3180381-maximumpotentialextendeddynamicr.
func (s Screen) MaximumPotentialExtendedDynamicRangeColorComponentValue() float64 {
	return float64(C.Screen_MaximumPotentialExtendedDynamicRangeColorComponentValue(s.screen))
}
