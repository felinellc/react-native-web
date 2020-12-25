/* @flow */

import React, { Component } from 'react';
import StyleSheet from '../StyleSheet';
import createElement from '../createElement';

const defaultKeyframeFactory = () => ({
  translateX: 0,
  translateY: 0,
  scaleX: 1.0,
  scaleY: 1.0
});

function LayoutAnimation() {
  /* =========== Layout Animation Manager =========== */

  // Manager Instance Properties
  let pendingConfig = undefined;
  const observedElements = new Set();
  const prevCache = new Map();

  //Used for removal
  const latestCache = new Map();

  function registerElement(view) {
    observedElements.add(view);
  }

  function deregisterElement(view) {
    observedElements.delete(view);
  }

  function transformKeyframeToCSSString(transformKeyframe) {
    let result = '';

    Object.keys(transformKeyframe).forEach(propName => {
      const value = transformKeyframe[propName];

      if (['translateX', 'translateY'].includes(propName)) {
        result += `${propName}(${value}px) `;
      } else {
        result += `${propName}(${value}) `;
      }
    });

    return result;
  }

  function getStartingKeyframe(prevRect, nextRect) {
    const result = defaultKeyframeFactory();

    if (prevRect.left !== nextRect.left) {
      result.translateX = prevRect.left - nextRect.left;
    }

    if (prevRect.top !== nextRect.top) {
      result.translateY = prevRect.top - nextRect.top;
    }

    if (prevRect.width !== nextRect.width) {
      result.scaleX = prevRect.width / nextRect.width;
    }

    if (prevRect.height !== nextRect.height) {
      result.scaleY = prevRect.height / nextRect.height;
    }

    return result;
  }

  function constructAndApplyLayoutAnimation(
    target,
    pendingAnimationConfig,
    originalTargetForRemoval
  ) {
    let prevRect = prevCache.get(target);

    let latestRect = latestCache.get(originalTargetForRemoval);

    let nextRect = target.getBoundingClientRect();

    let animationKeyframes;
    let fillMode = 'backwards';

    if (!prevRect || originalTargetForRemoval) {
      //Handle opacity.

      if (!prevRect) {
        //The element was just created!
        animationKeyframes = [{ opacity: 0 }, { opacity: 1 }];
      }

      if (originalTargetForRemoval && latestRect) {
        //The element was removed!
        animationKeyframes = [
          {
            opacity: 1,
            position: 'absolute',
            top: latestRect.y + 'px',
            left: latestRect.x + 'px'
          },
          {
            opacity: 0,
            position: 'absolute',
            top: latestRect.y + 'px',
            left: latestRect.x + 'px'
          }
        ];
        fillMode = 'forwards';
      }
    } else {
      //Transformation NEeded
      if (JSON.stringify(prevRect) === JSON.stringify(nextRect)) {
        return Promise.resolve();
      }

      const startingKeyframe = getStartingKeyframe(prevRect, nextRect);
      let existingTransform = window.getComputedStyle(target).getPropertyValue('transform');

      if (existingTransform === 'none') {
        existingTransform = 'translateX(0)';
      }

      animationKeyframes = [
        {
          transform: `${existingTransform} ${transformKeyframeToCSSString(startingKeyframe)}`
        },
        {
          transform: existingTransform
        }
      ];
    }

    const animationConfig = {
      duration: pendingAnimationConfig.duration || 500,
      delay: pendingAnimationConfig.delay || 0,
      easing: pendingAnimationConfig.type || 'linear',
      fill: fillMode
    };

    return target.animate(animationKeyframes, animationConfig).finished.then(() => {
      latestCache.set(target, target.getBoundingClientRect());
      return Promise.resolve();
    });
  }

  function handleLayoutChange(entries, observer) {
    observer.disconnect();

    const pendingAnimationConfig = pendingConfig;

    if (pendingAnimationConfig == null) {
      return Promise.resolve();
    }

    pendingConfig = undefined;

    const animations = [];
    for (let entry of entries) {
      animations.push(constructAndApplyLayoutAnimation(entry.target, pendingAnimationConfig));
    }
    return Promise.all(animations).then(() => Promise.resolve());
  }

  function configureNext(config) {
    pendingConfig = config;

    const ro = new ResizeObserver(handleLayoutChange);

    prevCache.clear();

    for (let element of observedElements) {
      const rect = element.getBoundingClientRect();

      if (rect.height && rect.width) prevCache.set(element, element.getBoundingClientRect());

      console.log('Observing element', element);
      ro.observe(element);
    }
  }

  /* =========== Layout Animation React Component =========== */

  class LayoutAnimatedNode extends Component {
    node;

    constructor(props) {
      super(props);

      if (!global.id) {
        global.id = 1;
      }

      this.id = 'animatedNode-' + global.id;
      global.id++;

      this.element = createElement('div', props, this.id);
    }

    getElement() {
      console.log('Getting Element', this.id, document.getElementById(this.id));
      return document.getElementById(this.id);
    }

    getId() {
      return this.id;
    }

    componentDidMount() {
      this.node = Object.values(this.refs)[0];
      if (this.node != null && this.props.animate) {
        registerElement(this.node);
        constructAndApplyLayoutAnimation(this.node, {});
      }
    }

    componentWillUnmount() {
      if (this.node != null && observedElements.has(this.node)) {
        deregisterElement(this.node);
        var clone = this.node.cloneNode(true);
        const parent = this.node.parentElement;
        parent.appendChild(clone);
        document.body.setAttribute('style', 'pointer-events:none');
        constructAndApplyLayoutAnimation(clone, {}, this.node).then(() => {
          parent.removeChild(clone);
          document.body.setAttribute('style', '');
        });
      }
    }

    componentDidUpdate() {
      this.domElement = document.getElementById(this.id);
    }

    render() {
      let props = Object.assign({}, this.props);

      if (props.animate) {
        configureNext({
          duration: props.animateDuration || 500,
          type: props.animateEasing || 'ease-in-out'
        });
      }
      if (props.animateChildren) {
        props.children = props.children.map(childFreeze => {
          if (!childFreeze) return childFreeze;
          let child = Object.assign({}, childFreeze);
          child.props = Object.assign({}, child.props, {
            animate: true,
            animateDuration: props.animateDuration,
            animateEasing: props.animateEasing
          });
          return child;
        });
      }

      props.style = [
        props.style,
        {
          transformOrigin: 'center center',
          willChange: 'transform'
        }
      ];

      //console.log('AnimationInnerElement', props);
      return createElement('div', props);
    }
  }

  return {
    configureNext,
    Node: LayoutAnimatedNode
  };
}

export default LayoutAnimation();
