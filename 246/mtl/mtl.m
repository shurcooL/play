#include <stdlib.h>
#import <Metal/Metal.h>
#include "mtl.h"

// Caller must call free(d).
struct Device * CreateSystemDefaultDevice() {
	id<MTLDevice> device = MTLCreateSystemDefaultDevice();
	if (!device) {
		return NULL;
	}

	struct Device * d = malloc(sizeof(struct Device));
	d->headless = device.headless;
	d->lowPower = device.lowPower;
	d->removable = device.removable;
	d->registryID = device.registryID;
	d->name = device.name.UTF8String;
	return d;
}

// Caller must call free(d.devices).
struct Devices CopyAllDevices() {
	NSArray<id<MTLDevice>> * devices = MTLCopyAllDevices();

	struct Devices d;
	d.devices = malloc(devices.count * sizeof(struct Device));
	for (int i = 0; i < devices.count; i++) {
		d.devices[i].headless = devices[i].headless;
		d.devices[i].lowPower = devices[i].lowPower;
		d.devices[i].removable = devices[i].removable;
		d.devices[i].registryID = devices[i].registryID;
		d.devices[i].name = devices[i].name.UTF8String;
	}
	d.length = devices.count;
	return d;
}
