#include <ApplicationServices/ApplicationServices.h>

void postEvent() {
	CGEventRef event = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitPixel, 1, -10);
	CGEventPost(kCGHIDEventTap, event);
	CFRelease(event);
}
