// +build darwin

#import <Cocoa/Cocoa.h>
#include "appkit.h"

void * Window_Screen(void * window) {
	return ((NSWindow *)window).screen;
}

double Screen_MaximumPotentialExtendedDynamicRangeColorComponentValue(void * screen) {
	return ((NSScreen *)screen).maximumPotentialExtendedDynamicRangeColorComponentValue;
}
