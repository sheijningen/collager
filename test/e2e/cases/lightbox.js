/* Stepping through the collage from the lightbox with the arrow keys. */
module.exports = {
  name: 'lightbox',
  async run({ js, check, waitFor, loadFixtures }) {
    await loadFixtures();
    const stepping = await js(`(() => {
      T.setColumns(1); // tall enough to scroll
      const items = T.state.items;
      // the newest element is the one on its way in; earlier ones go once it paints
      const shownUrl = () => document.getElementById('lightbox-content').lastElementChild.src;
      T.openLightbox(items[0]);
      press('ArrowLeft');
      const stopsAtStart = shownUrl() === items[0].url;
      press('ArrowRight');
      const stepsForward = shownUrl() === items[1].url && T.shownHash === items[1].hash;
      items[2].missing = true;
      press('ArrowRight');
      const skipsMissing = shownUrl() === items[3].url;
      items[2].missing = false;
      press('ArrowLeft');
      const stepsBack = shownUrl() === items[2].url;
      for (let step = 0; step < items.length; step++) press('ArrowRight');
      const last = items[items.length - 1];
      const stopsAtEnd = shownUrl() === last.url && !T.lightbox.hidden;
      return { stopsAtStart, stepsForward, skipsMissing, stepsBack, stopsAtEnd };
    })()`);
    check('Left at the first item stays put', stepping.stopsAtStart);
    check('Right shows the next item', stepping.stepsForward);
    check('a missing item is skipped', stepping.skipsMissing);
    check('Left steps back', stepping.stepsBack);
    check('Right at the last item stays put', stepping.stopsAtEnd);
    // the scroll is smooth, so the collage arrives a little later
    const followed = await waitFor(() =>
      js(`(() => {
        const last = T.state.items[T.state.items.length - 1];
        const wanted = Math.max(0, T.lastPositions.get(last.hash).y - 40);
        const reachable = Math.min(wanted, T.scroller.scrollHeight - T.scroller.clientHeight);
        return reachable > 0 && Math.abs(T.scroller.scrollTop - reachable) < 1;
      })()`)
    );
    check('the collage scrolls to the shown item', followed);
    check(
      'the item stepped away from goes once the new one has painted',
      await waitFor(() => js(`document.getElementById('lightbox-content').children.length === 1`))
    );
    check(
      'closing forgets the shown item',
      await js('T.closeLightbox(); T.shownHash === null && T.lightbox.hidden')
    );
  }
};
