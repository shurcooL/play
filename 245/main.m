#import <Foundation/NSObjCRuntime.h>
#import <Metal/Metal.h>

void run() {
	id<MTLDevice> device = MTLCreateSystemDefaultDevice();
	NSLog(@"%@", [device name]);
}
