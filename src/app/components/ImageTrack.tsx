import React, { useState, useRef, useEffect } from 'react';

const ImageTrack = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [mouseDownAt, setMouseDownAt] = useState<number>(0);
  const [prevPercentage, setPrevPercentage] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(0);

  const handleOnDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    setMouseDownAt(clientX);
  };

  const handleOnUp = () => {
    setMouseDownAt(0);
    setPrevPercentage(percentage);
  };

  const handleOnMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (mouseDownAt === 0) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const mouseDelta = mouseDownAt - clientX;
    const maxDelta = window.innerWidth / 2;

    const percentageDelta = (mouseDelta / maxDelta) * -100;
    const nextPercentageUnconstrained = prevPercentage + percentageDelta;
    const nextPercentage = Math.max(Math.min(nextPercentageUnconstrained, 0), -100);

    setPercentage(nextPercentage);

    if (trackRef.current) {
      trackRef.current.animate({
        transform: `translate(${nextPercentage}%, -50%)`
      }, { duration: 1200, fill: "forwards" });

      for (const image of trackRef.current.getElementsByClassName("image")) {
        // Parallax effect: Move image opposite to track direction
        // Map percentage (0 to -100) to translate range (-19% to 19%)
        // Scale 1.4 provides 40% buffer (20% each side)
        const movePercentage = (nextPercentage + 50) * -0.40;
        
        (image as HTMLElement).animate({
          transform: `translate(${movePercentage}%, 0%) scale(1.4)`
        }, { duration: 1200, fill: "forwards" });
      }
    }
  };

  // Local images from /public/photos
  const images = [
    "/photos/IMG_6319.jpg",
    "/photos/shared185.JPG",
    "/photos/IMG_1673.jpeg",
    "/photos/IMG_6264.JPG",
    "/photos/IMG_8388.jpeg",
    "/photos/IMG_3040.jpeg",
    "/photos/IMG_3050.jpeg",
    "/photos/IMG_3427.JPG",
  ];

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Keep for future use if needed
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
        className="relative w-full h-[60vh] bg-black overflow-hidden select-none my-4"
        onMouseDown={handleOnDown}
        onTouchStart={handleOnDown}
        onMouseUp={handleOnUp}
        onTouchEnd={handleOnUp}
        onMouseMove={handleOnMove}
        onTouchMove={handleOnMove}
    >
      <div 
        ref={trackRef} 
        id="image-track" 
        className="flex gap-[4vmin] absolute top-1/2 -translate-y-1/2 select-none"
        style={{ transform: `translate(0%, -50%)` }}
      >
        {images.map((src, index) => (
          <div key={index} className="image-wrapper relative w-[40vmin] h-[56vmin] overflow-hidden select-none pointer-events-none">
            <img 
              className="image w-full h-full object-cover select-none pointer-events-none scale-[1.4]"
              src={src} 
              draggable="false"
              alt={`photo-${index + 1}`}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-sm pointer-events-none">
        Drag to explore
      </div>
    </div>
  );
};

export default ImageTrack;
